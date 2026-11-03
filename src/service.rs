use axum::{extract::{State, Path, Query, DefaultBodyLimit, ws::{WebSocketUpgrade, Message}}, http::{HeaderMap, StatusCode, header}, response::{IntoResponse, Response, Redirect}, routing::{get, post}, Json, Router};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, Validation, Algorithm, decode, decode_header, jwk::JwkSet};
use sea_orm::{Database, DatabaseConnection, ConnectionTrait, TransactionTrait, Statement, Value, DbBackend, QueryResult};
use serde::{Serialize, Deserialize};
use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};
use std::{collections::{BTreeMap, HashMap, HashSet}, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use utoipa::{OpenApi, ToSchema};
use crate::{model::*, markdown};

type Result<T> = std::result::Result<T, ApiError>;
#[derive(Debug)]
pub struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response { (self.0, Json(json!({"error": self.1}))).into_response() }
}
impl From<sea_orm::DbErr> for ApiError {
    fn from(e: sea_orm::DbErr) -> Self { tracing::error!(error = %e, "Database operation failed"); Self(StatusCode::SERVICE_UNAVAILABLE, "The database could not complete the request. Try again.".into()) }
}
impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self { tracing::error!(error=%e, "Stored data could not be decoded"); Self(StatusCode::INTERNAL_SERVER_ERROR, "Stored data could not be read.".into()) }
}
fn bad(text: impl Into<String>) -> ApiError { ApiError(StatusCode::BAD_REQUEST, text.into()) }
fn forbidden() -> ApiError { ApiError(StatusCode::FORBIDDEN, "This operation requires access to the project.".into()) }
fn missing() -> ApiError { ApiError(StatusCode::NOT_FOUND, "The requested item was not found.".into()) }
fn conflict() -> ApiError { ApiError(StatusCode::CONFLICT, "Another user saved changes. Your draft is retained; reload the current version before saving.".into()) }
fn random() -> String { format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple()) }
fn hash(input: &str) -> String { URL_SAFE_NO_PAD.encode(Sha256::digest(input.as_bytes())) }

#[derive(Clone)]
pub struct App { db: DatabaseConnection, config: Arc<Config>, client: reqwest::Client, signal: broadcast::Sender<String>, rates:Arc<tokio::sync::Mutex<HashMap<std::net::IpAddr,(std::time::Instant,usize)>>>, renderer:Arc<crate::renderer::Renderer>, project_lock:Arc<tokio::sync::Mutex<()>> }
struct Config { origin: String, base_path: String, issuer: String, identity_issuer: String, internal_oidc: String, client_id: String, client_secret: String, insecure: bool, ttl: i64, max_bytes: usize, ws_limit: usize, role_claim:String, role_map:HashMap<String,String>, subject_roles:HashMap<String,String>, sprint_days:u32, enforce_dependencies:bool, requests_per_minute:usize, max_tree_depth:usize }
fn env(name: &str, fallback: &str) -> String { std::env::var(name).unwrap_or_else(|_| fallback.into()) }
fn secret(name: &str) -> std::result::Result<String, Box<dyn std::error::Error>> {
    if let Ok(file) = std::env::var(format!("{name}_FILE")) { return Ok(std::fs::read_to_string(file)?.trim().into()); }
    Ok(env(name, ""))
}
fn sql(backend: DbBackend, query: &str, values: Vec<Value>) -> Statement {
    let mut index = 0;
    let query = if backend == DbBackend::Postgres { query.chars().map(|c| if c == '?' { index += 1; format!("${index}") } else { c.to_string() }).collect::<String>() } else { query.into() };
    Statement::from_sql_and_values(backend, query, values)
}
fn stmt<C: ConnectionTrait>(db: &C, q: &str, v: Vec<Value>) -> Statement { sql(db.get_database_backend(), q, v) }
fn col(row: &QueryResult, name: &str) -> Result<String> { Ok(row.try_get("", name)?) }

pub async fn run() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let origin = env("APP_ORIGIN", "http://localhost:8080").trim_end_matches('/').to_string();
    let base_path = env("APP_BASE_PATH", "").trim_end_matches('/').to_string();
    if !base_path.is_empty() && (!base_path.starts_with('/') || base_path.split('/').skip(1).any(|part| part.is_empty() || !part.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'))) { return Err("APP_BASE_PATH must contain slash-separated URL path segments".into()); }
    let insecure = env("ALLOW_INSECURE_HTTP", "false") == "true";
    let issuer = env("OIDC_ISSUER", "").trim_end_matches('/').to_string() + "/";
    let identity_issuer = env("OIDC_IDENTITY_ISSUER", "");
    let identity_issuer = if identity_issuer.is_empty() { issuer.clone() } else {
        let parsed=reqwest::Url::parse(&identity_issuer)?;
        if !["http","https"].contains(&parsed.scheme()) || parsed.host_str().is_none() || parsed.query().is_some() || parsed.fragment().is_some() || !parsed.username().is_empty() || parsed.password().is_some() { return Err("OIDC_IDENTITY_ISSUER must be an HTTP or HTTPS issuer URL without credentials, query or fragment".into()); }
        identity_issuer.trim_end_matches('/').to_string()+"/"
    };
    if !insecure && (!origin.starts_with("https://") || !issuer.starts_with("https://")) { return Err("APP_ORIGIN and OIDC_ISSUER require HTTPS; local tests may explicitly set ALLOW_INSECURE_HTTP=true".into()); }
    let config = Config {
        origin, base_path, issuer, identity_issuer, internal_oidc: env("OIDC_INTERNAL_ORIGIN", ""), client_id: env("OIDC_CLIENT_ID", "todo"),
        client_secret: secret("OIDC_CLIENT_SECRET")?, insecure,
        ttl: env("SESSION_SECONDS", "28800").parse()?, max_bytes: env("MAX_REQUEST_BYTES", "16777216").parse()?,
        ws_limit: env("MAX_WEBSOCKETS", "1000").parse()?,
        role_claim:env("OIDC_ROLES_CLAIM","groups"),
        role_map:serde_json::from_str(&env("OIDC_ROLE_MAP",r#"{"todo-admin":"admin","todo-editor":"editor","todo-reader":"reader"}"#))?,
        subject_roles:serde_json::from_str(&env("OIDC_SUBJECT_ROLES","{}"))?,
        sprint_days:env("SPRINT_DAYS","14").parse()?, enforce_dependencies:env("ENFORCE_DEPENDENCIES","true")=="true",
        requests_per_minute:env("REQUESTS_PER_MINUTE","6000").parse()?,
        max_tree_depth:env("MAX_TREE_DEPTH","64").parse()?,
    };
    if config.client_secret.is_empty() { return Err("OIDC_CLIENT_SECRET or OIDC_CLIENT_SECRET_FILE is required".into()); }
    if config.max_tree_depth==0{return Err("MAX_TREE_DEPTH must be at least one".into());}
    let mut database_url = secret("DATABASE_URL")?;
    if database_url.is_empty() { database_url = "sqlite://todo.db?mode=rwc".into(); }
    let db = Database::connect(&database_url).await?;
    for query in [
        "CREATE TABLE IF NOT EXISTS people (id VARCHAR(64) PRIMARY KEY, data TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(64) PRIMARY KEY, data TEXT NOT NULL, expires BIGINT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS projects (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, state TEXT NOT NULL, version BIGINT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS events (id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, sequence BIGINT NOT NULL, task_id VARCHAR(64) NOT NULL, data TEXT NOT NULL, UNIQUE(project_id, sequence))",
    ] { let portable=if db.get_database_backend()==DbBackend::MySql{query.replace(" TEXT "," LONGTEXT ")}else{query.into()};db.execute(stmt(&db, &portable, vec![])).await?; }
    let (signal, _) = broadcast::channel(256);
    let app = App { db, config: Arc::new(config), client: reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build()?, signal, rates:Arc::new(tokio::sync::Mutex::new(HashMap::new())), renderer:Arc::new(crate::renderer::Renderer::default()),project_lock:Arc::new(tokio::sync::Mutex::new(())) };
    let routes = Router::new()
        .route("/health", get(health))
        .route("/auth/login", get(login)).route("/auth/callback", get(callback)).route("/auth/logout", post(logout)).route("/auth/provider-logout",get(provider_logout))
        .route("/api/me", get(me)).route("/api/users", get(users))
        .route("/api/projects", get(projects).post(create_project))
        .route("/api/projects/{project}", get(project_info).post(rename_project).delete(delete_project))
        .route("/api/load", post(load_project))
        .route("/api/session/events",get(session_events))
        .route("/api/projects/{project}/members", get(members).post(set_member))
        .route("/api/projects/{project}/tasks", get(tasks).post(create_task))
        .route("/api/projects/{project}/tasks/{task}", post(save_task))
        .route("/api/projects/{project}/tasks/{task}/move", post(move_task))
        .route("/api/projects/{project}/tasks/{task}/revert", post(revert))
        .route("/api/projects/{project}/history", get(history))
        .route("/api/projects/{project}/import", post(import))
        .route("/api/projects/{project}/import-json", post(import_json))
        .route("/api/projects/{project}/sprints",get(sprints).post(save_sprint))
        .route("/api/projects/{project}/export", get(export))
        .route("/api/projects/{project}/events", get(events))
        .route("/api/projects/{project}/diagram", get(diagram))
        .route("/api/openapi.json", get(api_spec)).route("/api/docs", get(api_docs))
        .fallback(get(assets))
        .layer(axum::middleware::from_fn(security_headers))
        .layer(axum::middleware::from_fn_with_state(app.clone(),rate_limit))
        .layer(DefaultBodyLimit::max(app.config.max_bytes)).with_state(app);
    let listener = tokio::net::TcpListener::bind(env("LISTEN_ADDRESS", "0.0.0.0:8080")).await?;
    #[cfg(unix)]
    let shutdown={
        let mut terminate=tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        let mut interrupt=tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
        async move{tokio::select!{_ = terminate.recv()=>{},_ = interrupt.recv()=>{}}}
    };
    #[cfg(not(unix))]
    let shutdown=async{if let Err(error)=tokio::signal::ctrl_c().await{tracing::error!(error=%error,"Shutdown signal could not be received");}};
    tracing::info!(address=%listener.local_addr()?, "Task service ready");
    axum::serve(listener, routes.into_make_service_with_connect_info::<std::net::SocketAddr>()).with_graceful_shutdown(shutdown).await?;
    Ok(())
}

async fn rate_limit(State(a):State<App>,request:axum::extract::Request,next:axum::middleware::Next)->Response {
    if let Some(peer)=request.extensions().get::<axum::extract::ConnectInfo<std::net::SocketAddr>>(){
        let mut rates=a.rates.lock().await;let now=std::time::Instant::now();rates.retain(|_,(start,_)|now.duration_since(*start)<Duration::from_secs(60));
        let entry=rates.entry(peer.0.ip()).or_insert((now,0));entry.1+=1;
        if entry.1>a.config.requests_per_minute{return ApiError(StatusCode::TOO_MANY_REQUESTS,"The request limit was reached. Try again shortly.".into()).into_response();}
    }
    next.run(request).await
}

async fn security_headers(request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let mut response = next.run(request).await;
    for (key, value) in [
        ("x-content-type-options", "nosniff"), ("x-frame-options", "DENY"), ("referrer-policy", "same-origin"),
        ("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"),
        ("cache-control", "no-store"), ("permissions-policy", "camera=(), microphone=(), geolocation=()"),
    ] { if !response.headers().contains_key(key) { response.headers_mut().insert(key, value.parse().unwrap()); } }
    response
}

#[utoipa::path(get, path="/health", responses((status=200, description="Database is reachable")))]
async fn health(State(a): State<App>) -> Result<Json<JsonValue>> {
    a.db.query_one(stmt(&a.db, "SELECT 1", vec![])).await?;
    Ok(Json(json!({"status":"ready"})))
}
fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers.get(header::COOKIE)?.to_str().ok()?.split(';').find_map(|part| {
        let (k,v) = part.trim().split_once('=')?; (k == name).then(|| v.into())
    })
}
fn cookie_value(config: &Config, name: &str, token: &str, seconds: i64) -> String {
    format!("{name}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={seconds}{}", if config.insecure { "" } else { "; Secure" })
}
async fn put_session(a: &App, token: &str, data: JsonValue, ttl: i64) -> Result<()> {
    a.db.execute(stmt(&a.db, "INSERT INTO sessions (id,data,expires) VALUES (?,?,?)", vec![hash(token).into(), data.to_string().into(), (Utc::now().timestamp()+ttl).into()])).await?; Ok(())
}
async fn read_session(a: &App, token: &str) -> Result<JsonValue> {
    let row = a.db.query_one(stmt(&a.db, "SELECT data FROM sessions WHERE id=? AND expires>?", vec![hash(token).into(), Utc::now().timestamp().into()])).await?
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "Sign in to continue.".into()))?;
    Ok(serde_json::from_str(&col(&row,"data")?)?)
}
async fn authenticated_session(a: &App, headers: &HeaderMap, write: bool) -> Result<Session> {
    let token = cookie(headers, "todo_session").ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "Sign in to continue.".into()))?;
    let value = read_session(a, &token).await?;
    let s: Session = serde_json::from_value(value).map_err(|_|ApiError(StatusCode::UNAUTHORIZED,"Sign in to continue.".into()))?;
    if write {
        check_origin(a, headers)?;
        if headers.get("x-csrf-token").and_then(|h| h.to_str().ok()) != Some(&s.csrf) { return Err(forbidden()); }
    }
    Ok(s)
}
async fn session(a: &App, headers: &HeaderMap, write: bool) -> Result<Session> {
    let mut s=authenticated_session(a,headers,write).await?;
    s.user.role=resolve_role(a,&s.subject,&s.groups)?;
    Ok(s)
}
fn check_origin(a: &App, headers: &HeaderMap) -> Result<()> {
    if headers.get(header::ORIGIN).and_then(|h| h.to_str().ok()) != Some(&a.config.origin) { return Err(forbidden()); } Ok(())
}

#[derive(Deserialize)]
struct Discovery { issuer: String, authorization_endpoint: String, token_endpoint: String, jwks_uri: String, end_session_endpoint: Option<String> }
async fn discovery(a: &App) -> Result<Discovery> {
    let url = format!("{}.well-known/openid-configuration", a.config.issuer);
    let d: Discovery = oidc_get(a, &url).await?.json().await.map_err(|_| bad("The identity provider returned an invalid discovery document."))?;
    if d.issuer != a.config.issuer { return Err(bad("The identity provider issuer does not match OIDC_ISSUER.")); }
    for endpoint in [&d.authorization_endpoint, &d.token_endpoint, &d.jwks_uri].into_iter().chain(d.end_session_endpoint.as_ref()) {
        let u = reqwest::Url::parse(endpoint).map_err(|_| bad("Invalid identity provider endpoint."))?;
        let issuer = reqwest::Url::parse(&a.config.issuer).map_err(|_| bad("Invalid OIDC_ISSUER."))?;
        if u.origin() != issuer.origin() { return Err(bad("Identity provider endpoints must use the configured issuer origin.")); }
    }
    Ok(d)
}
fn oidc_request(a: &App, method: reqwest::Method, url: &str) -> Result<reqwest::RequestBuilder> {
    let public = reqwest::Url::parse(url).map_err(|_| bad("Invalid identity provider address."))?;
    let mut target = public.clone();
    let mut builder;
    if !a.config.internal_oidc.is_empty() {
        let internal = reqwest::Url::parse(&a.config.internal_oidc).map_err(|_| bad("Invalid OIDC_INTERNAL_ORIGIN."))?;
        target.set_scheme(internal.scheme()).map_err(|_| bad("Invalid internal scheme."))?;
        target.set_host(internal.host_str()).map_err(|_| bad("Invalid internal host."))?;
        target.set_port(internal.port()).map_err(|_| bad("Invalid internal port."))?;
        builder = a.client.request(method,target);
        let authority=format!("{}{}",public.host_str().unwrap_or(""),public.port().map(|p|format!(":{p}")).unwrap_or_default());
        builder = builder.header("Host", &authority).header("X-Forwarded-Host",&authority).header("X-Forwarded-Proto",public.scheme());
    } else { builder = a.client.request(method,target); }
    Ok(builder)
}
async fn oidc_get(a: &App, url: &str) -> Result<reqwest::Response> {
    oidc_request(a,reqwest::Method::GET,url)?.send().await.map_err(|_| bad("The identity provider could not be reached."))?.error_for_status().map_err(|_| bad("The identity provider refused the request."))
}

#[utoipa::path(get, path="/auth/login", responses((status=303, description="Redirect to configured OpenID provider")))]
async fn login(State(a): State<App>, headers:HeaderMap) -> Response {
    match begin_login(&a).await {Ok(response)=>response,Err(error)=>authentication_error(&a,&headers,error)}
}
async fn begin_login(a: &App) -> Result<Response> {
    let d = discovery(&a).await?;
    let token = random(); let state = random(); let nonce = random(); let verifier = random();
    put_session(&a, &token, json!({"state":state,"nonce":nonce,"verifier":verifier}), 600).await?;
    let mut url = reqwest::Url::parse(&d.authorization_endpoint).map_err(|_| bad("Invalid authorization endpoint."))?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", a.config.client_id.as_str()), ("response_type","code"), ("scope","openid profile"),
        ("redirect_uri", format!("{}{}/auth/callback",a.config.origin,a.config.base_path).as_str()), ("state",state.as_str()),
        ("nonce",nonce.as_str()), ("code_challenge",hash(&verifier).as_str()), ("code_challenge_method","S256"),
    ]);
    let mut response = Redirect::to(url.as_str()).into_response();
    response.headers_mut().insert(header::SET_COOKIE,cookie_value(&a.config,"todo_login",&token,600).parse().unwrap()); Ok(response)
}
#[derive(Deserialize)]
struct Callback { code: Option<String>, state: Option<String>, error: Option<String> }
#[derive(Clone, Deserialize)]
struct Claims { sub: String, preferred_username: Option<String>, nonce: Option<String>, #[serde(flatten)] extra:HashMap<String,JsonValue> }
fn resolve_role(a:&App,subject:&str,groups:&[String])->Result<String>{
    configured_role(subject,groups,&a.config.role_map,&a.config.subject_roles)
}
fn configured_role(subject:&str,groups:&[String],role_map:&HashMap<String,String>,subject_roles:&HashMap<String,String>)->Result<String>{
    let mapped=groups.iter().filter_map(|g|role_map.get(g)).min_by_key(|r|match r.as_str(){"admin"=>0,"editor"=>1,_=>2}).cloned();
    let role=subject_roles.get(subject).cloned().or(mapped).unwrap_or_else(||"none".into());
    if !["admin","editor","reader"].contains(&role.as_str()){return Err(ApiError(StatusCode::FORBIDDEN,"No application role is assigned. Contact an administrator.".into()));}Ok(role)
}
async fn verify_id(a: &App, d: &Discovery, token: &str) -> Result<Claims> {
    let header = decode_header(token).map_err(|_| bad("Invalid identity token."))?;
    if ![Algorithm::RS256,Algorithm::RS384,Algorithm::RS512,Algorithm::ES256,Algorithm::ES384].contains(&header.alg) { return Err(bad("The identity token uses an unsupported signing algorithm.")); }
    let keys: JwkSet = oidc_get(a,&d.jwks_uri).await?.json().await.map_err(|_| bad("Invalid identity provider signing keys."))?;
    let key = keys.find(header.kid.as_deref().ok_or_else(|| bad("The identity token has no signing key identifier."))?).ok_or_else(|| bad("The identity token signing key was not found."))?;
    let mut validation = Validation::new(header.alg);
    validation.set_audience(&[a.config.client_id.as_str()]); validation.set_issuer(&[a.config.issuer.as_str()]);
    validation.set_required_spec_claims(&["exp","iss","aud","sub"]);
    decode::<Claims>(token,&DecodingKey::from_jwk(key).map_err(|_| bad("Invalid signing key."))?,&validation).map(|t|t.claims).map_err(|_| bad("The identity token signature, issuer, audience or expiry is invalid."))
}
#[utoipa::path(get, path="/auth/callback", responses((status=303, description="Verified session established"),(status=400,description="Invalid OIDC state, token or nonce")))]
async fn callback(State(a): State<App>, headers: HeaderMap, Query(q): Query<Callback>) -> Response {
    match complete_login(&a,&headers,q).await {Ok(response)=>response,Err(error)=>authentication_error(&a,&headers,error)}
}
async fn complete_login(a: &App, headers: &HeaderMap, q: Callback) -> Result<Response> {
    if q.error.is_some() { return Err(bad("Sign-in was declined by the identity provider. Start sign-in again.")); }
    let token = cookie(&headers,"todo_login").ok_or_else(|| bad("The sign-in session is missing. Start sign-in again."))?;
    let flow = read_session(&a,&token).await?;
    if q.state.as_deref() != flow["state"].as_str() || q.state.is_none() { return Err(bad("The sign-in state does not match. Start sign-in again.")); }
    a.db.execute(stmt(&a.db,"DELETE FROM sessions WHERE id=?",vec![hash(&token).into()])).await?;
    let d = discovery(&a).await?;
    let response = oidc_request(&a,reqwest::Method::POST,&d.token_endpoint)?.form(&[
        ("grant_type","authorization_code"),("client_id",&a.config.client_id),("client_secret",&a.config.client_secret),
        ("code",q.code.as_deref().ok_or_else(||bad("The identity provider returned no code."))?),
        ("redirect_uri",&format!("{}{}/auth/callback",a.config.origin,a.config.base_path)),("code_verifier",flow["verifier"].as_str().unwrap_or("")),
    ]).send().await.map_err(|_|bad("The identity provider could not complete sign-in."))?;
    if !response.status().is_success() { return Err(bad("The identity provider refused the authorization code.")); }
    let tokens: JsonValue = response.json().await.map_err(|_|bad("The identity provider returned invalid tokens."))?;
    let claims = verify_id(&a,&d,tokens["id_token"].as_str().ok_or_else(||bad("No ID token was returned."))?).await?;
    if claims.nonce.as_deref() != flow["nonce"].as_str() || claims.nonce.is_none() { return Err(bad("The identity token nonce does not match.")); }
    let groups=claims.extra.get(&a.config.role_claim).and_then(|v|v.as_array()).map(|v|v.iter().filter_map(|g|g.as_str().map(str::to_string)).collect::<Vec<_>>()).unwrap_or_default();
    let role=resolve_role(&a,&claims.sub,&groups)?;
    let user = User { id: hash(&format!("{}\0{}",a.config.identity_issuer,claims.sub)), username: claims.preferred_username.unwrap_or_else(||claims.sub.clone()),role };
    if user.username.is_empty() || user.username.chars().any(|c| c.is_control() || "[],#".contains(c)) { return Err(bad("The identity provider username contains unsupported task-format characters.")); }
    let tx = a.db.begin().await?;
    if tx.query_one(stmt(&tx,"SELECT id FROM people WHERE id=?",vec![user.id.clone().into()])).await?.is_some() {
        tx.execute(stmt(&tx,"UPDATE people SET data=? WHERE id=?",vec![serde_json::to_string(&user)?.into(),user.id.clone().into()])).await?;
    } else { tx.execute(stmt(&tx,"INSERT INTO people (id,data) VALUES (?,?)",vec![user.id.clone().into(),serde_json::to_string(&user)?.into()])).await?; }
    tx.commit().await?;
    let session_token = random();
    put_session(&a,&session_token,serde_json::to_value(Session{user,csrf:random(),subject:claims.sub,groups})?,a.config.ttl).await?;
    a.db.execute(stmt(&a.db,"DELETE FROM sessions WHERE expires<?",vec![Utc::now().timestamp().into()])).await?;
    let mut response = Redirect::to(&format!("{}/",a.config.base_path)).into_response();
    response.headers_mut().append(header::SET_COOKIE,cookie_value(&a.config,"todo_session",&session_token,a.config.ttl).parse().unwrap());
    response.headers_mut().append(header::SET_COOKIE,cookie_value(&a.config,"todo_login","",0).parse().unwrap()); Ok(response)
}
#[utoipa::path(post, path="/auth/logout", security(("session"=[])), responses((status=200,description="Session revoked")))]
async fn logout(State(a): State<App>, headers: HeaderMap) -> Result<Response> {
    authenticated_session(&a,&headers,true).await?;
    let token = cookie(&headers,"todo_session").unwrap();
    a.db.execute(stmt(&a.db,"DELETE FROM sessions WHERE id=?",vec![hash(&token).into()])).await?;
    let _ = a.signal.send("logout".into());
    let mut response = Json(json!({"signed_out":true})).into_response();
    response.headers_mut().insert(header::SET_COOKIE,cookie_value(&a.config,"todo_session","",0).parse().unwrap()); Ok(response)
}
#[utoipa::path(get,path="/auth/provider-logout",responses((status=303,description="Redirect to the discovered OpenID end-session endpoint")))]
async fn provider_logout(State(a):State<App>,headers:HeaderMap)->Response{
    match discovery(&a).await.and_then(|discovery|discovery.end_session_endpoint.ok_or_else(||bad("The identity provider does not publish an end-session endpoint. Sign out in the identity provider."))){
        Ok(endpoint)=>Redirect::to(&endpoint).into_response(),
        Err(error)=>authentication_error(&a,&headers,error),
    }
}
fn authentication_error(a:&App,headers:&HeaderMap,error:ApiError)->Response{
    if headers.get(header::ACCEPT).and_then(|value|value.to_str().ok()).is_some_and(|value|value.contains("text/html")){
        if let Some(html)=entry_html(a,Some(&error.1)){return(error.0,[(header::CONTENT_TYPE,"text/html; charset=utf-8")],html).into_response();}
    }
    error.into_response()
}
#[utoipa::path(get, path="/api/me", security(("session"=[])), responses((status=200,description="Current user and CSRF token"),(status=401,description="Sign-in required")))]
async fn me(State(a): State<App>, headers: HeaderMap) -> Result<Json<JsonValue>> {
    let s = session(&a,&headers,false).await?;let token=cookie(&headers,"todo_session").unwrap();let row=a.db.query_one(stmt(&a.db,"SELECT expires FROM sessions WHERE id=?",vec![hash(&token).into()])).await?.ok_or_else(||ApiError(StatusCode::UNAUTHORIZED,"Sign in to continue.".into()))?;let expires:i64=row.try_get("","expires")?; Ok(Json(json!({"session_expires_at":expires*1000,"server_time":Utc::now().timestamp_millis(),"user":s.user,"csrf_token":s.csrf,"identity":{"issuer":a.config.issuer,"subject":s.subject},"settings":{"sprint_days":a.config.sprint_days,"enforce_dependencies":a.config.enforce_dependencies}})))
}
async fn all_users(a: &App) -> Result<Vec<User>> {
    a.db.query_all(stmt(&a.db,"SELECT data FROM people",vec![])).await?.iter().map(|r|Ok(serde_json::from_str(&col(r,"data")?)?)).collect()
}
#[utoipa::path(get, path="/api/users", security(("session"=[])), responses((status=200,body=[User])))]
async fn users(State(a): State<App>, headers: HeaderMap) -> Result<Json<Vec<User>>> { session(&a,&headers,false).await?; Ok(Json(all_users(&a).await?)) }

struct Loaded { id: String, name: String, state: ProjectState, version: i64, role: String }
fn document_heading(preamble:&str)->Option<(std::ops::Range<usize>,String)>{
    use pulldown_cmark::{Parser,Event,Tag,TagEnd,HeadingLevel};
    let mut heading=None;let mut title=String::new();
    for (event,range) in Parser::new(preamble).into_offset_iter(){match event{
        Event::Start(Tag::Heading{level:HeadingLevel::H1,..})=>heading=Some(range),
        Event::Text(text)|Event::Code(text) if heading.is_some()=>title.push_str(&text),
        Event::SoftBreak|Event::HardBreak if heading.is_some()=>title.push(' '),
        Event::End(TagEnd::Heading(HeadingLevel::H1))=>return heading.map(|range|(range,title.trim().to_owned())),
        _=>{}
    }}None
}
fn heading_text(name:&str)->String{name.chars().map(|c|if c.is_ascii_punctuation(){format!("\\{c}")}else{c.to_string()}).collect()}
fn project_metadata(preamble:&str,fallback:&str)->(String,String){
    if let Some((_,title))=document_heading(preamble){return (title,preamble.into());}
    let title=fallback.trim().to_owned();let preamble=format!("# {}\n\n{preamble}",heading_text(&title)).trim_end().to_owned();(title,preamble)
}
fn validate_project_name(name:&str)->Result<()>{
    if name.trim().is_empty()||name.len()>255||name.contains(['\n','\r']){return Err(bad("A project name on one line of at most 255 bytes is required."));}Ok(())
}
async fn load(a: &App, id: &str, user: &User, write: bool) -> Result<Loaded> {
    let row = a.db.query_one(stmt(&a.db,"SELECT name,state,version FROM projects WHERE id=?",vec![id.into()])).await?.ok_or_else(missing)?;
    let mut state: ProjectState = serde_json::from_str(&col(&row,"state")?)?;
    let (name,preamble)=project_metadata(&state.preamble,&col(&row,"name")?);state.preamble=preamble;
    let role = if user.role=="admin" {"admin".into()} else {state.members.get(&user.id).ok_or_else(forbidden)?;user.role.clone()};
    if write && role == "reader" { return Err(forbidden()); }
    Ok(Loaded{id:id.into(),name,state,version:row.try_get("","version")?,role})
}
async fn project_named(a:&App,name:&str)->Result<Option<String>>{
    let mut matched=None;
    for row in a.db.query_all(stmt(&a.db,"SELECT id,name,state FROM projects",vec![])).await?{
        let state:ProjectState=serde_json::from_str(&col(&row,"state")?)?;
        if project_metadata(&state.preamble,&col(&row,"name")?).0==name{
            if matched.is_some(){return Err(bad("Several projects use this document title. Rename one before loading."));}
            matched=Some(col(&row,"id")?);
        }
    }
    Ok(matched)
}

#[derive(Deserialize,ToSchema)]
struct LoadProject { source:String, expected_versions:BTreeMap<String,i64> }
#[utoipa::path(post,path="/api/load",request_body=LoadProject,security(("session"=[])),responses((status=200,description="Created or merged project selected by document title"),(status=403,description="Project access or administrator required"),(status=409,description="Project changed since file selection")))]
async fn load_project(State(a):State<App>,headers:HeaderMap,Json(body):Json<LoadProject>)->Result<Json<JsonValue>>{
    let s=session(&a,&headers,true).await?;
    if s.user.role=="reader"{return Err(forbidden());}
    let source=body.source.trim_start_matches('\u{feff}');
    let json=source.trim_start().starts_with('{')||source.trim_start().starts_with('[');
    let document=if json{Some(serde_json::from_str::<JsonValue>(source).map_err(|_|bad("The JSON file could not be read. Correct its syntax and load it again."))?)}else{None};
    let name=if let Some(document)=&document{
        let preamble=document["state"]["preamble"].as_str().unwrap_or("");
        document_heading(preamble).map(|(_,name)|name).or_else(||document["name"].as_str().map(str::to_owned))
    }else{
        let parsed=markdown::parse(source,&HashMap::new()).map_err(bad)?;
        document_heading(&parsed.preamble).map(|(_,name)|name)
    }.ok_or_else(||bad("The file needs a project title. Add a Markdown heading (# Project name) or a JSON project name."))?;
    let name=name.trim().to_owned();validate_project_name(&name)?;
    let _guard=a.project_lock.lock().await;
    let existing=project_named(&a,&name).await?;
    let created=existing.is_none();
    let p=if let Some(id)=existing{
        let p=load(&a,&id,&s.user,true).await?;
        if body.expected_versions.get(&id)!=Some(&p.version){return Err(conflict());}
        p
    }else{
        if s.user.role!="admin"{return Err(forbidden());}
        let mut members=BTreeMap::new();members.insert(s.user.id.clone(),"member".into());
        Loaded{id:uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL,format!("todo-project:{name}").as_bytes()).to_string(),name,state:ProjectState{members,..Default::default()},version:1,role:"admin".into()}
    };
    let id=p.id.clone();let sequence=p.version;
    let mut result=if let Some(document)=document{
        apply_json(&a,&s.user,p,JsonImport{document,mode:"merge".into(),dry_run:false,expected_sequence:Some(sequence)},created).await?
    }else{
        apply_markdown(&a,&s.user,p,Import{markdown:source.into(),mode:"merge".into(),dry_run:false,expected_sequence:Some(sequence)},created).await?
    };
    let saved=load(&a,&id,&s.user,false).await?;
    let values=result.0.as_object_mut().unwrap();
    values.insert("project".into(),json!(Project{id:saved.id,name:saved.name,role:saved.role,sequence:saved.version}));values.insert("created".into(),json!(created));
    Ok(result)
}

async fn save_import(a:&App,p:&Loaded,user:&User,events:&[History],new_project:bool)->Result<()>{
    let tx=a.db.begin().await?;
    let version=p.version+events.len() as i64;
    if new_project{
        tx.execute(stmt(&tx,"INSERT INTO projects (id,name,state,version) VALUES (?,?,?,?)",vec![p.id.clone().into(),p.name.clone().into(),serde_json::to_string(&p.state)?.into(),version.into()])).await?;
        insert_event(&tx,&History{id:random(),project_id:p.id.clone(),sequence:1,task_id:String::new(),actor:user.clone(),at:stamp(),action:"project_created".into(),fields:vec!["name".into()],before:JsonValue::Null,after:json!({"name":p.name}),imported_by:None,source_revision_id:None}).await?;
    }else{
        let changed=tx.execute(stmt(&tx,"UPDATE projects SET name=?,state=?,version=? WHERE id=? AND version=?",vec![p.name.clone().into(),serde_json::to_string(&p.state)?.into(),version.into(),p.id.clone().into(),p.version.into()])).await?;
        if changed.rows_affected()!=1{return Err(conflict());}
    }
    for event in events{insert_event(&tx,event).await?;}
    tx.commit().await?;let _=a.signal.send(p.id.clone());Ok(())
}

#[derive(Deserialize,ToSchema)]
struct DeleteProject { expected_sequence:i64 }
#[utoipa::path(delete,path="/api/projects/{project}",params(("project"=String,Path)),request_body=DeleteProject,security(("session"=[])),responses((status=200,description="Project and its complete history deleted"),(status=403,description="Administrator required"),(status=409,description="Project changed")))]
async fn delete_project(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<DeleteProject>)->Result<Json<JsonValue>>{
    let s=session(&a,&headers,true).await?;if s.user.role!="admin"{return Err(forbidden());}
    let _guard=a.project_lock.lock().await;let p=load(&a,&id,&s.user,true).await?;
    if body.expected_sequence!=p.version{return Err(conflict());}
    let tx=a.db.begin().await?;
    let deleted=tx.execute(stmt(&tx,"DELETE FROM projects WHERE id=? AND version=?",vec![id.clone().into(),p.version.into()])).await?;
    if deleted.rows_affected()!=1{return Err(conflict());}
    tx.execute(stmt(&tx,"DELETE FROM events WHERE project_id=?",vec![id.clone().into()])).await?;
    tx.commit().await?;let _=a.signal.send(id);Ok(Json(json!({"deleted":true})))
}
#[utoipa::path(get, path="/api/projects", security(("session"=[])), responses((status=200,body=[Project])))]
async fn projects(State(a): State<App>, headers: HeaderMap) -> Result<Json<Vec<Project>>> {
    let s = session(&a,&headers,false).await?; let mut result = vec![];
    for row in a.db.query_all(stmt(&a.db,"SELECT id,name,state,version FROM projects ORDER BY name",vec![])).await? {
        let state: ProjectState = serde_json::from_str(&col(&row,"state")?)?;
        if s.user.role=="admin"||state.members.contains_key(&s.user.id) { result.push(Project{id:col(&row,"id")?,name:project_metadata(&state.preamble,&col(&row,"name")?).0,role:s.user.role.clone(),sequence:row.try_get("","version")?}); }
    } Ok(Json(result))
}
#[derive(Deserialize,ToSchema)]
struct NewProject { name: String }
#[utoipa::path(post,path="/api/projects",request_body=NewProject,security(("session"=[])),responses((status=200,body=Project)))]
async fn create_project(State(a): State<App>, headers: HeaderMap, Json(body): Json<NewProject>) -> Result<Json<Project>> {
    let s = session(&a,&headers,true).await?;
    if s.user.role!="admin"{return Err(forbidden());}
    let _guard=a.project_lock.lock().await;
    let name=body.name.trim().to_owned();validate_project_name(&name)?;
    if project_named(&a,&name).await?.is_some(){return Err(ApiError(StatusCode::CONFLICT,"A project with this title already exists. Load its document to merge changes.".into()));}
    let id = uuid::Uuid::new_v4().to_string(); let mut members = BTreeMap::new(); members.insert(s.user.id.clone(),"member".into());
    let state = ProjectState{members,preamble:format!("# {}",heading_text(&name)),..Default::default()};
    let event = History{id:random(),project_id:id.clone(),sequence:1,task_id:String::new(),actor:s.user,at:stamp(),action:"project_created".into(),fields:vec!["name".into(),"preamble".into()],before:JsonValue::Null,after:json!({"name":name,"preamble":state.preamble}),imported_by:None,source_revision_id:None};
    let tx = a.db.begin().await?;
    tx.execute(stmt(&tx,"INSERT INTO projects (id,name,state,version) VALUES (?,?,?,?)",vec![id.clone().into(),name.clone().into(),serde_json::to_string(&state)?.into(),1i64.into()])).await?;
    insert_event(&tx,&event).await?; tx.commit().await?;
    Ok(Json(Project{id,name,role:event.actor.role,sequence:1}))
}
#[derive(Serialize,ToSchema)]
struct Snapshot { #[serde(flatten)] project:Project, tasks:Vec<Task>, sprints:Vec<Sprint>, members:BTreeMap<String,String>, preamble:String }
#[utoipa::path(get,path="/api/projects/{project}",params(("project"=String,Path)),security(("session"=[])),responses((status=200,body=Snapshot)))]
async fn project_info(State(a): State<App>,headers:HeaderMap,Path(id):Path<String>) -> Result<Json<Snapshot>> {
    let s=session(&a,&headers,false).await?; let p=load(&a,&id,&s.user,false).await?; Ok(Json(Snapshot{project:Project{id:p.id,name:p.name,role:p.role,sequence:p.version},tasks:p.state.tasks,sprints:p.state.sprints,members:p.state.members,preamble:p.state.preamble}))
}
#[derive(Deserialize,ToSchema)]
struct RenameProject { name:String, expected_sequence:i64 }
#[utoipa::path(post,path="/api/projects/{project}",params(("project"=String,Path)),request_body=RenameProject,security(("session"=[])),responses((status=200,body=Project),(status=409,description="The project changed")))]
async fn rename_project(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<RenameProject>)->Result<Json<Project>>{
    let s=session(&a,&headers,true).await?;if s.user.role!="admin"{return Err(forbidden());}
    let _guard=a.project_lock.lock().await;let mut p=load(&a,&id,&s.user,true).await?;
    if body.expected_sequence!=p.version{return Err(conflict());}
    let name=body.name.trim().to_owned();validate_project_name(&name)?;
    if project_named(&a,&name).await?.is_some_and(|other|other!=id){return Err(ApiError(StatusCode::CONFLICT,"A project with this title already exists. Choose a different title.".into()));}
    let before=json!({"name":p.name,"preamble":p.state.preamble});p.name=name;
    if let Some((range,_))=document_heading(&p.state.preamble){let newline=if p.state.preamble[range.clone()].ends_with('\n'){"\n"}else{""};p.state.preamble.replace_range(range,&format!("# {}{newline}",heading_text(&p.name)));}else{p.state.preamble=project_metadata(&p.state.preamble,&p.name).1;}
    let after=json!({"name":p.name,"preamble":p.state.preamble});
    let fields=differences(&before,&after);let event=commit(&a,&p,&s.user,"project_renamed","",before,after,fields).await?;
    Ok(Json(Project{id:p.id,name:p.name,role:p.role,sequence:event.sequence}))
}
#[utoipa::path(get,path="/api/projects/{project}/members",params(("project"=String,Path)),security(("session"=[])),responses((status=200,description="Project user IDs and roles")))]
async fn members(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>) -> Result<Json<BTreeMap<String,String>>> {
    let s=session(&a,&headers,false).await?; Ok(Json(load(&a,&id,&s.user,false).await?.state.members))
}
#[derive(Deserialize,ToSchema)]
struct MemberChange { user_id:String, role:String, expected_sequence:i64 }
#[utoipa::path(post,path="/api/projects/{project}/members",params(("project"=String,Path)),request_body=MemberChange,security(("session"=[])),responses((status=200,body=History),(status=403,description="Administrator required")))]
async fn set_member(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<MemberChange>) -> Result<Json<History>> {
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    if p.role!="admin" { return Err(forbidden()); }
    if body.expected_sequence!=p.version{return Err(conflict());}
    if !["member","remove"].contains(&body.role.as_str()) {return Err(bad("Choose member or remove. Roles are assigned by the identity provider or environment configuration."));}
    if !all_users(&a).await?.iter().any(|u|u.id==body.user_id) {return Err(bad("The selected user must sign in once before being added."));}
    let before=json!(p.state.members);
    if body.role=="remove" {p.state.members.remove(&body.user_id);}else{p.state.members.insert(body.user_id,body.role);}
    let after=json!(p.state.members);let e=commit(&a,&p,&s.user,"members_changed","",before,after,vec!["members".into()]).await?;Ok(Json(e))
}

async fn insert_event<C:ConnectionTrait>(db:&C,event:&History)->Result<()> {
    db.execute(stmt(db,"INSERT INTO events (id,project_id,sequence,task_id,data) VALUES (?,?,?,?,?)",vec![event.id.clone().into(),event.project_id.clone().into(),event.sequence.into(),event.task_id.clone().into(),serde_json::to_string(event)?.into()])).await?;Ok(())
}
async fn commit(a:&App,p:&Loaded,user:&User,action:&str,task_id:&str,before:JsonValue,after:JsonValue,fields:Vec<String>)->Result<History> {
    let e=History{id:random(),project_id:p.id.clone(),sequence:p.version+1,task_id:task_id.into(),actor:user.clone(),at:stamp(),action:action.into(),fields,before,after,imported_by:None,source_revision_id:None};
    let tx=a.db.begin().await?;
    let changed=tx.execute(stmt(&tx,"UPDATE projects SET name=?,state=?,version=? WHERE id=? AND version=?",vec![p.name.clone().into(),serde_json::to_string(&p.state)?.into(),e.sequence.into(),p.id.clone().into(),p.version.into()])).await?;
    if changed.rows_affected()!=1 {return Err(conflict());}
    insert_event(&tx,&e).await?;tx.commit().await?;let _=a.signal.send(p.id.clone());Ok(e)
}
#[utoipa::path(get,path="/api/projects/{project}/tasks",params(("project"=String,Path)),security(("session"=[])),responses((status=200,body=[Task])))]
async fn tasks(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>)->Result<Json<Vec<Task>>> {
    let s=session(&a,&headers,false).await?;Ok(Json(load(&a,&id,&s.user,false).await?.state.tasks))
}
fn validate(task:&Task,others:&[Task],maximum:usize)->Result<()> {
    if uuid::Uuid::parse_str(&task.id).is_err(){return Err(bad("The internal task ID must be a UUID."));}
    if task.title.trim().is_empty() || task.description.trim().is_empty() {return Err(bad("Title and description are required."));}
    if [&task.title,&task.description,&task.reference].iter().any(|s|s.contains(['\n','\r'])) {return Err(bad("Title, description and identifier must each fit on one line."));}
    if !STATUSES.contains(&task.status.as_str()) || !["","H","M","L"].contains(&task.priority.as_str()) || task.complexity>9 {return Err(bad("Choose a supported status, priority and complexity from zero to nine."));}
    if task.reference.is_empty() || task.reference.chars().any(|c|c.is_whitespace() || "#[]".contains(c)) {return Err(bad("The task identifier must contain no spaces, brackets or hash."));}
    if others.iter().any(|t|t.id!=task.id && t.reference==task.reference) {return Err(bad("This task identifier is already used in the project."));}
    if let Some(d)=&task.due_date {if chrono::NaiveDate::parse_from_str(d,"%Y-%m-%d").is_err(){return Err(bad("Choose a valid due date."));}}
    let mut current=task.parent_id.clone();let mut seen=HashSet::new();
    while let Some(id)=current {
        if id==task.id || !seen.insert(id.clone()) {return Err(bad("Moving this task would create a cycle."));}
        let parent=others.iter().find(|t|t.id==id).ok_or_else(||bad("The parent task does not exist in this project."))?;
        current=parent.parent_id.clone();
    }
    let mut pending=vec![(task.id.as_str(),seen.len()+1)];let mut visited=HashSet::new();
    while let Some((id,depth))=pending.pop(){
        if depth>maximum{return Err(bad(format!("Move this task higher in the tree; the configured depth limit is {maximum}.")));}
        if !visited.insert(id){continue;}
        pending.extend(others.iter().filter(|t|t.id!=task.id&&t.parent_id.as_deref()==Some(id)).map(|t|(t.id.as_str(),depth+1)));
    }
    markdown::validate_details(&task.details).map_err(bad)?;
    Ok(())
}
fn validate_owners(task:&Task,users:&[User])->Result<()> {
    if task.owners.iter().any(|id|!users.iter().any(|user|&user.id==id)){return Err(bad("Choose owners from users who have signed in."));}
    Ok(())
}
fn owner_by_name<'a>(name:&str,users:&'a[User])->Result<Option<&'a User>> {
    let mut matches=users.iter().filter(|user|user.username==name);let first=matches.next();
    if matches.next().is_some(){return Err(bad(format!("The username {name} matches more than one remembered identity. Sign in again with renamed accounts or use JSON with stable user IDs.")));}
    Ok(first)
}
fn validate_planning(_a:&App,task:&Task,state:&ProjectState)->Result<()> {
    if let Some(sprint)=&task.sprint_id {if !state.sprints.iter().any(|s|&s.id==sprint){return Err(bad("The sprint does not exist in this project."));}}
    let mut pending=task.depends_on.clone();let mut seen=HashSet::new();
    while let Some(id)=pending.pop(){
        if id==task.id{return Err(bad("This dependency would create a cycle."));}
        if !seen.insert(id.clone()){continue;}
        let dependency=state.tasks.iter().find(|t|t.id==id).ok_or_else(||bad("A dependency does not exist in this project."))?;
        pending.extend(dependency.depends_on.clone());
    }
    Ok(())
}
fn validate_transition(a:&App,task:&Task,state:&ProjectState,previous:Option<&Task>)->Result<()> {
    if a.config.enforce_dependencies && previous.is_none_or(|old|old.status!=task.status) && ["in_work","done"].contains(&task.status.as_str()) && task.depends_on.iter().any(|id|state.tasks.iter().find(|t|&t.id==id).is_some_and(|t|t.status!="done")) {
        return Err(bad("Complete the dependencies before starting or completing this task."));
    }
    Ok(())
}
#[derive(Deserialize,ToSchema)]
struct SaveTask { task:Task, expected_version:u64 }
fn differences(before:&JsonValue,after:&JsonValue)->Vec<String>{
    after.as_object().map(|m|m.keys().filter(|k|!["version","updated_at"].contains(&k.as_str()) && before.get(*k)!=after.get(*k)).cloned().collect()).unwrap_or_default()
}
async fn save(a:&App,user:&User,p:&mut Loaded,mut task:Task,expected:u64,create:bool)->Result<Task>{
    let previous=p.state.tasks.iter().find(|t|t.id==task.id).cloned();
    if create {if let Some(old)=&previous{
        let mut retry=task.clone();retry.version=old.version;retry.updated_at=old.updated_at.clone();retry.owners.sort();retry.owners.dedup();
        if expected==0&&retry==*old{return Ok(old.clone());}return Err(conflict());
    }}
    if !create && previous.is_none(){return Err(missing());}
    if previous.as_ref().map(|t|t.version).unwrap_or(0)!=expected {return Err(conflict());}
    let known=all_users(a).await?;
    validate_owners(&task,&known)?;
    task.owners.sort();task.owners.dedup();task.version=expected+1;task.updated_at=stamp();
    validate(&task,&p.state.tasks,a.config.max_tree_depth)?;validate_planning(a,&task,&p.state)?;validate_transition(a,&task,&p.state,previous.as_ref())?;
    let before=serde_json::to_value(previous)?;let after=serde_json::to_value(&task)?;
    let fields=differences(&before,&after);
    if create{p.state.tasks.push(task.clone());}else{*p.state.tasks.iter_mut().find(|t|t.id==task.id).unwrap()=task.clone();}
    commit(a,p,user,if create{"task_created"}else{"task_saved"},&task.id,before,after,fields).await?;Ok(task)
}
#[utoipa::path(post,path="/api/projects/{project}/tasks",params(("project"=String,Path)),request_body=SaveTask,security(("session"=[])),responses((status=200,body=Task),(status=409,description="Concurrent change")))]
async fn create_task(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<SaveTask>)->Result<Json<Task>>{
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    let mut task=body.task;if task.id.is_empty(){task.id=uuid::Uuid::new_v4().to_string();}if task.reference.is_empty(){task.reference=format!("task-{}",task.id);}
    Ok(Json(save(&a,&s.user,&mut p,task,body.expected_version,true).await?))
}
#[utoipa::path(post,path="/api/projects/{project}/tasks/{task}",params(("project"=String,Path),("task"=String,Path)),request_body=SaveTask,security(("session"=[])),responses((status=200,body=Task),(status=409,description="Concurrent change")))]
async fn save_task(State(a):State<App>,headers:HeaderMap,Path((id,task_id)):Path<(String,String)>,Json(body):Json<SaveTask>)->Result<Json<Task>>{
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    if body.task.id!=task_id{return Err(bad("The task identifier does not match the request."));}
    Ok(Json(save(&a,&s.user,&mut p,body.task,body.expected_version,false).await?))
}
#[derive(Deserialize,ToSchema)]
struct MoveTask { parent_id:Option<String>, before_id:Option<String>, expected_sequence:i64 }
#[utoipa::path(post,path="/api/projects/{project}/tasks/{task}/move",params(("project"=String,Path),("task"=String,Path)),request_body=MoveTask,security(("session"=[])),responses((status=200,body=[Task]),(status=400,description="Invalid hierarchy destination"),(status=409,description="Concurrent project change")))]
async fn move_task(State(a):State<App>,headers:HeaderMap,Path((id,task_id)):Path<(String,String)>,Json(body):Json<MoveTask>)->Result<Json<Vec<Task>>>{
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    if p.version!=body.expected_sequence{return Err(conflict());}
    let original=p.state.tasks.iter().find(|t|t.id==task_id).cloned().ok_or_else(missing)?;
    if original.archived{return Err(bad("Restore the task before moving it."));}
    if let Some(parent)=&body.parent_id {
        let destination=p.state.tasks.iter().find(|t|t.id==*parent).ok_or_else(missing)?;
        if destination.archived{return Err(bad("Choose an unarchived destination."));}
    }
    let mut moved=original.clone();moved.parent_id=body.parent_id.clone();
    validate(&moved,&p.state.tasks,a.config.max_tree_depth)?;
    if original.parent_id==body.parent_id {
        let mut current=p.state.tasks.iter().filter(|t|t.parent_id==body.parent_id).collect::<Vec<_>>();current.sort_by_key(|t|t.order);
        let index=current.iter().position(|t|t.id==task_id).unwrap();
        if current.get(index+1).map(|t|t.id.as_str())==body.before_id.as_deref(){return Ok(Json(vec![]));}
    }
    let mut siblings=p.state.tasks.iter().filter(|t|t.parent_id==body.parent_id&&t.id!=task_id).cloned().collect::<Vec<_>>();
    siblings.sort_by_key(|t|t.order);
    let at=match &body.before_id {
        Some(before)=>siblings.iter().position(|t|t.id==*before).ok_or_else(||bad("Choose a task at the destination level before which to place the branch."))?,
        None=>siblings.len(),
    };
    siblings.insert(at,moved);
    let mut changes=vec![];
    for (order,mut task) in siblings.into_iter().enumerate(){
        let previous=p.state.tasks.iter_mut().find(|t|t.id==task.id).unwrap();task.order=order as i64;
        if task.parent_id==previous.parent_id&&task.order==previous.order{continue;}
        let before=serde_json::to_value(&*previous)?;task.version=previous.version+1;task.updated_at=stamp();let after=serde_json::to_value(&task)?;
        let fields=differences(&before,&after);changes.push((task.clone(),before,after,fields));*previous=task;
    }
    if changes.is_empty(){return Ok(Json(vec![]));}
    let tx=a.db.begin().await?;
    let updated=tx.execute(stmt(&tx,"UPDATE projects SET state=?,version=? WHERE id=? AND version=?",vec![serde_json::to_string(&p.state)?.into(),(p.version+changes.len() as i64).into(),p.id.clone().into(),p.version.into()])).await?;
    if updated.rows_affected()!=1{return Err(conflict());}
    for (index,(task,before,after,fields)) in changes.iter().enumerate(){
        insert_event(&tx,&History{id:random(),project_id:p.id.clone(),sequence:p.version+index as i64+1,task_id:task.id.clone(),actor:s.user.clone(),at:stamp(),action:"task_moved".into(),fields:fields.clone(),before:before.clone(),after:after.clone(),imported_by:None,source_revision_id:None}).await?;
    }
    tx.commit().await?;let _=a.signal.send(p.id);Ok(Json(changes.into_iter().map(|(task,_,_,_)|task).collect()))
}
#[derive(Deserialize,ToSchema)]
struct Revert { revision_id:String, fields:Vec<String>, expected_version:u64 }
#[utoipa::path(post,path="/api/projects/{project}/tasks/{task}/revert",params(("project"=String,Path),("task"=String,Path)),request_body=Revert,security(("session"=[])),responses((status=200,body=Task),(status=409,description="Stale revision")))]
async fn revert(State(a):State<App>,headers:HeaderMap,Path((id,task_id)):Path<(String,String)>,Json(body):Json<Revert>)->Result<Json<Task>>{
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    let row=a.db.query_one(stmt(&a.db,"SELECT data FROM events WHERE id=? AND project_id=? AND task_id=?",vec![body.revision_id.into(),id.into(),task_id.clone().into()])).await?.ok_or_else(missing)?;
    let revision:History=serde_json::from_str(&col(&row,"data")?)?;
    let current=p.state.tasks.iter().find(|t|t.id==task_id).cloned().ok_or_else(missing)?;
    if current.version!=body.expected_version{return Err(conflict());}
    let mut value=serde_json::to_value(&current)?;
    if body.fields.is_empty(){return Err(bad("Choose at least one field to restore."));}
    for field in &body.fields {
        if !["title","description","details","parent_id","status","priority","complexity","due_date","owners","reference","next_week","archived","order","depends_on","sprint_id"].contains(&field.as_str()){return Err(bad("This field cannot be restored."));}
        value[field]=revision.after.get(field).ok_or_else(||bad("This revision contains no task snapshot."))?.clone();
    }
    let mut task:Task=serde_json::from_value(value)?;
    validate_owners(&task,&all_users(&a).await?).map_err(|_|bad("This revision contains owners who have not signed in here. Sign in with those identities or restore fields other than owners."))?;
    task.version=current.version+1;task.updated_at=stamp();validate(&task,&p.state.tasks,a.config.max_tree_depth)?;validate_planning(&a,&task,&p.state)?;validate_transition(&a,&task,&p.state,Some(&current))?;
    *p.state.tasks.iter_mut().find(|t|t.id==task_id).unwrap()=task.clone();
    commit(&a,&p,&s.user,"task_restored",&task_id,serde_json::to_value(current)?,serde_json::to_value(&task)?,body.fields).await?;Ok(Json(task))
}
#[derive(Deserialize,Default)]
struct HistoryQuery { task_id:Option<String>, before:Option<i64> }
#[utoipa::path(get,path="/api/projects/{project}/history",params(("project"=String,Path),("task_id"=Option<String>,Query),("before"=Option<i64>,Query)),security(("session"=[])),responses((status=200,body=[History])))]
async fn history(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Query(q):Query<HistoryQuery>)->Result<Json<Vec<History>>>{
    let s=session(&a,&headers,false).await?;load(&a,&id,&s.user,false).await?;
    let mut query="SELECT data FROM events WHERE project_id=? AND sequence<?".to_string();let mut values=vec![id.into(),q.before.unwrap_or(i64::MAX).into()];
    if let Some(task)=q.task_id{query.push_str(" AND task_id=?");values.push(task.into());}query.push_str(" ORDER BY sequence DESC LIMIT 100");
    let records=a.db.query_all(stmt(&a.db,&query,values)).await?.iter().map(|r|Ok(serde_json::from_str(&col(r,"data")?)?)).collect::<Result<Vec<History>>>()?;Ok(Json(records))
}

#[derive(Deserialize,ToSchema)]
struct Import { markdown:String, mode:String, dry_run:bool, expected_sequence:Option<i64> }
#[utoipa::path(post,path="/api/projects/{project}/import",params(("project"=String,Path)),request_body=Import,security(("session"=[])),responses((status=200,description="Preview or committed import"),(status=400,description="Invalid task format")))]
async fn import(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<Import>)->Result<Json<JsonValue>>{
    let s=session(&a,&headers,true).await?;let _guard=a.project_lock.lock().await;let p=load(&a,&id,&s.user,true).await?;
    apply_markdown(&a,&s.user,p,body,false).await
}
async fn apply_markdown(a:&App,user:&User,mut p:Loaded,body:Import,new_project:bool)->Result<Json<JsonValue>>{
    if !["merge","replace"].contains(&body.mode.as_str()){return Err(bad("Choose merge or replace."));}
    if !body.dry_run && body.expected_sequence!=Some(p.version){return Err(conflict());}
    let users=all_users(&a).await?;
    let existing=p.state.tasks.iter().map(|t|(t.reference.clone(),t.clone())).collect::<HashMap<_,_>>();
    let mut parsed=markdown::parse(&body.markdown,&existing).map_err(bad)?;
    let (name,preamble)=project_metadata(&parsed.preamble,&p.name);validate_project_name(&name)?;parsed.preamble=preamble;
    if name!=p.name{if user.role!="admin"{return Err(forbidden());}if project_named(a,&name).await?.is_some_and(|id|id!=p.id){return Err(bad("A project with this title already exists. Load its document to merge changes."));}}
    let mut unknown=vec![];
    for t in &mut parsed.tasks{for owner in &mut t.owners {if let Some(u)=owner_by_name(owner,&users)?{*owner=u.id.clone();}else{unknown.push(owner.clone());}}}
    let included=parsed.tasks.iter().map(|t|t.id.clone()).collect::<HashSet<_>>();
    let removed=p.state.tasks.iter().filter(|t|!included.contains(&t.id)&&!t.archived).map(|t|json!({"id":t.id,"title":t.title})).collect::<Vec<_>>();
    let preview=json!({"tasks":parsed.tasks,"unknown_owners":unknown,"removed":if body.mode=="replace"{removed.clone()}else{vec![]},"sequence":p.version});
    if body.dry_run{
        let mut candidate=p.state.clone();
        for task in &parsed.tasks{if let Some(old)=candidate.tasks.iter_mut().find(|t|t.id==task.id){*old=task.clone();}else{candidate.tasks.push(task.clone());}}
        for task in &candidate.tasks{validate(task,&candidate.tasks,a.config.max_tree_depth)?;validate_planning(&a,task,&candidate)?;validate_transition(&a,task,&candidate,p.state.tasks.iter().find(|old|old.id==task.id))?;}
        return Ok(Json(preview));
    }
    if !unknown.is_empty(){return Err(bad(format!("Assign unknown owners before importing: {}",unknown.join(", "))));}
    let before=p.state.tasks.clone();let previous_metadata=json!({"name":p.name,"preamble":p.state.preamble});
    let mut changes=vec![];
    for mut task in parsed.tasks {
        let old=p.state.tasks.iter().find(|t|t.id==task.id).cloned();task.version=old.as_ref().map(|t|t.version).unwrap_or(0)+1;task.updated_at=stamp();
        let b=serde_json::to_value(&old)?;let after=serde_json::to_value(&task)?;
        changes.push((task.id.clone(),b.clone(),after.clone(),differences(&b,&after)));
        if let Some(t)=p.state.tasks.iter_mut().find(|t|t.id==task.id){*t=task;}else{p.state.tasks.push(task);}
    }
    if body.mode=="replace" {for task in &mut p.state.tasks{if !included.contains(&task.id)&&!task.archived{let b=serde_json::to_value(&*task)?;task.archived=true;task.version+=1;task.updated_at=stamp();changes.push((task.id.clone(),b,serde_json::to_value(&*task)?,vec!["archived".into()]));}}}
    for task in &p.state.tasks{validate(task,&p.state.tasks,a.config.max_tree_depth)?;validate_planning(&a,task,&p.state)?;validate_transition(&a,task,&p.state,before.iter().find(|old|old.id==task.id))?;}
    p.name=name;p.state.preamble=parsed.preamble;
    let metadata=json!({"name":p.name,"preamble":p.state.preamble});
    if previous_metadata!=metadata{let fields=differences(&previous_metadata,&metadata);changes.push((String::new(),previous_metadata,metadata,fields));}
    let events=changes.into_iter().enumerate().map(|(index,(task_id,b,after,fields))|History{id:random(),project_id:p.id.clone(),sequence:p.version+index as i64+1,task_id,actor:user.clone(),at:stamp(),action:"task_imported".into(),fields,before:b,after,imported_by:None,source_revision_id:None}).collect::<Vec<_>>();
    save_import(a,&p,user,&events,new_project).await?;
    Ok(Json(json!({"imported":included.len(),"previous":before.len()})))
}
#[utoipa::path(get,path="/api/projects/{project}/sprints",params(("project"=String,Path)),security(("session"=[])),responses((status=200,body=[Sprint])))]
async fn sprints(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>)->Result<Json<Vec<Sprint>>>{
    let s=session(&a,&headers,false).await?;Ok(Json(load(&a,&id,&s.user,false).await?.state.sprints))
}
#[derive(Deserialize,ToSchema)]
struct SaveSprint { sprint:Sprint, expected_sequence:i64 }
fn validate_sprint(s:&Sprint)->Result<()> {
    if uuid::Uuid::parse_str(&s.id).is_err(){return Err(bad("The internal sprint ID must be a UUID."));}
    let start=chrono::NaiveDate::parse_from_str(&s.start_date,"%Y-%m-%d").map_err(|_|bad("Choose a valid sprint start date."))?;
    let end=chrono::NaiveDate::parse_from_str(&s.end_date,"%Y-%m-%d").map_err(|_|bad("Choose a valid sprint end date."))?;
    if s.title.trim().is_empty()||end<start||!["planned","active","closed"].contains(&s.status.as_str()){return Err(bad("A sprint needs a title, an end on or after its start and a supported status."));}Ok(())
}
#[utoipa::path(post,path="/api/projects/{project}/sprints",params(("project"=String,Path)),request_body=SaveSprint,security(("session"=[])),responses((status=200,body=Sprint),(status=409,description="Concurrent project change")))]
async fn save_sprint(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<SaveSprint>)->Result<Json<Sprint>>{
    let s=session(&a,&headers,true).await?;let mut p=load(&a,&id,&s.user,true).await?;
    if p.version!=body.expected_sequence{return Err(conflict());}
    let mut sprint=body.sprint;if sprint.id.is_empty(){sprint.id=uuid::Uuid::new_v4().to_string();}validate_sprint(&sprint)?;
    let before=p.state.sprints.iter().find(|v|v.id==sprint.id).cloned();
    if sprint.status=="active"&&p.state.sprints.iter().any(|v|v.id!=sprint.id&&v.status=="active"){return Err(bad("Close the current active sprint before starting another."));}
    if let Some(old)=p.state.sprints.iter_mut().find(|v|v.id==sprint.id){*old=sprint.clone();}else{p.state.sprints.push(sprint.clone());}
    let b=serde_json::to_value(before)?;let after=serde_json::to_value(&sprint)?;
    commit(&a,&p,&s.user,"sprint_saved","",b.clone(),after.clone(),differences(&b,&after)).await?;Ok(Json(sprint))
}

#[derive(Deserialize,ToSchema)]
struct JsonImport { document:JsonValue, mode:String, dry_run:bool, expected_sequence:Option<i64> }
#[utoipa::path(post,path="/api/projects/{project}/import-json",params(("project"=String,Path)),request_body=JsonImport,security(("session"=[])),responses((status=200,description="Validated JSON preview or imported tasks and history")))]
async fn import_json(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Json(body):Json<JsonImport>)->Result<Json<JsonValue>> {
    let s=session(&a,&headers,true).await?;let _guard=a.project_lock.lock().await;let p=load(&a,&id,&s.user,true).await?;
    apply_json(&a,&s.user,p,body,false).await
}
async fn apply_json(a:&App,user:&User,mut p:Loaded,body:JsonImport,new_project:bool)->Result<Json<JsonValue>>{
    if body.document["format"]!="todo-project"||body.document["schema_version"]!=1{return Err(bad("Choose a task-project JSON export with schema version one."));}
    if !["merge","replace"].contains(&body.mode.as_str()){return Err(bad("Choose merge or replace."));}
    let mut imported:ProjectState=serde_json::from_value(body.document["state"].clone()).map_err(|_|bad("The JSON task data is invalid."))?;
    let (name,preamble)=project_metadata(&imported.preamble,body.document["name"].as_str().unwrap_or(&p.name));validate_project_name(&name)?;imported.preamble=preamble;
    if name!=p.name{if user.role!="admin"{return Err(forbidden());}if project_named(a,&name).await?.is_some_and(|id|id!=p.id){return Err(bad("A project with this title already exists. Load its document to merge changes."));}}
    let previous_metadata=json!({"name":p.name,"preamble":p.state.preamble});
    let old_history:Vec<History>=serde_json::from_value(body.document["history"].clone()).map_err(|_|bad("The JSON history is invalid."))?;
    let users=all_users(&a).await?;
    let unknown=imported.tasks.iter().flat_map(|t|t.owners.iter()).filter(|id|!users.iter().any(|u|&u.id==*id)).cloned().collect::<HashSet<_>>();
    let ids=imported.tasks.iter().map(|t|t.id.clone()).collect::<HashSet<_>>();
    if ids.len()!=imported.tasks.len(){return Err(bad("The JSON export contains duplicate task IDs."));}
    let removed=p.state.tasks.iter().filter(|t|!ids.contains(&t.id)&&!t.archived).cloned().collect::<Vec<_>>();
    let preview=json!({"tasks":imported.tasks,"unknown_owners":unknown,"removed":if body.mode=="replace"{removed}else{vec![]},"sequence":p.version,"history_count":old_history.len()});
    let sprint_ids=imported.sprints.iter().map(|s|&s.id).collect::<HashSet<_>>();
    if sprint_ids.len()!=imported.sprints.len(){return Err(bad("The JSON export contains duplicate sprint IDs."));}
    for event in &old_history{
        if chrono::DateTime::parse_from_rfc3339(&event.at).is_err(){return Err(bad("An imported revision has an invalid timestamp."));}
        if !event.task_id.is_empty(){for value in [&event.before,&event.after]{if !value.is_null(){let snapshot:Task=serde_json::from_value(value.clone()).map_err(|_|bad("An imported revision contains an invalid task snapshot."))?;if snapshot.id!=event.task_id{return Err(bad("An imported revision refers to a different task."));}}}}
    }
    let before=p.state.tasks.clone();
    for mut task in imported.tasks {
        task.version=p.state.tasks.iter().find(|t|t.id==task.id).map(|t|t.version+1).unwrap_or(1);task.updated_at=stamp();
        if let Some(old)=p.state.tasks.iter_mut().find(|t|t.id==task.id){*old=task;}else{p.state.tasks.push(task);}
    }
    if body.mode=="replace" {for task in &mut p.state.tasks{if !ids.contains(&task.id){task.archived=true;task.version+=1;task.updated_at=stamp();}}}
    for sprint in imported.sprints{validate_sprint(&sprint)?;if let Some(old)=p.state.sprints.iter_mut().find(|v|v.id==sprint.id){*old=sprint;}else{p.state.sprints.push(sprint);}}
    p.name=name;p.state.preamble=imported.preamble;
    if p.state.sprints.iter().filter(|s|s.status=="active").count()>1{return Err(bad("Close the current active sprint before importing another active sprint."));}
    for task in &p.state.tasks{validate(task,&p.state.tasks,a.config.max_tree_depth)?;validate_planning(&a,task,&p.state)?;validate_transition(&a,task,&p.state,before.iter().find(|old|old.id==task.id))?;}
    if body.dry_run{return Ok(Json(preview));}
    if body.expected_sequence!=Some(p.version){return Err(conflict());}
    if !unknown.is_empty(){return Err(bad("Some imported owners have not signed in to this installation."));}
    let existing=a.db.query_all(stmt(&a.db,"SELECT data FROM events WHERE project_id=?",vec![p.id.clone().into()])).await?;
    let mut seen=existing.iter().filter_map(|r|col(r,"data").ok()).filter_map(|text|serde_json::from_str::<History>(&text).ok()).flat_map(|e|[Some(e.id),e.source_revision_id]).flatten().collect::<HashSet<_>>();
    let mut events=vec![];
    for mut e in old_history{
        let source=e.source_revision_id.clone().unwrap_or_else(||e.id.clone());
        if (!e.task_id.is_empty()&&!ids.contains(&e.task_id))||seen.contains(&e.id)||!seen.insert(source.clone()){continue;}
        e.source_revision_id=Some(source);e.id=random();e.project_id=p.id.clone();e.sequence=p.version+events.len() as i64+1;e.imported_by=Some(user.clone());e.action=format!("history_imported:{}",e.action);events.push(e);
    }
    for task in &p.state.tasks{
        let b=serde_json::to_value(before.iter().find(|t|t.id==task.id))?;let after=serde_json::to_value(task)?;
        events.push(History{id:random(),project_id:p.id.clone(),sequence:p.version+events.len() as i64+1,task_id:task.id.clone(),actor:user.clone(),at:stamp(),action:"task_json_imported".into(),fields:differences(&b,&after),before:b,after,imported_by:None,source_revision_id:None});
    }
    let metadata=json!({"name":p.name,"preamble":p.state.preamble});let mut fields=vec!["tasks".into(),"sprints".into()];fields.extend(differences(&previous_metadata,&metadata));
    events.push(History{id:random(),project_id:p.id.clone(),sequence:p.version+events.len() as i64+1,task_id:String::new(),actor:user.clone(),at:stamp(),action:"project_json_imported".into(),fields,before:json!({"tasks":before.len(),"name":previous_metadata["name"],"preamble":previous_metadata["preamble"]}),after:json!({"tasks":p.state.tasks.len(),"sprints":p.state.sprints.len(),"name":p.name,"preamble":p.state.preamble}),imported_by:None,source_revision_id:None});
    save_import(a,&p,user,&events,new_project).await?;
    Ok(Json(json!({"imported":ids.len(),"history_count":events.len()})))
}

#[derive(Deserialize)]
struct ExportQuery { format:Option<String> }
#[utoipa::path(get,path="/api/projects/{project}/export",params(("project"=String,Path),("format"=Option<String>,Query)),security(("session"=[])),responses((status=200,description="Markdown or complete project JSON export")))]
async fn export(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Query(q):Query<ExportQuery>)->Result<Response>{
    let s=session(&a,&headers,false).await?;let p=load(&a,&id,&s.user,false).await?;
    if q.format.as_deref()==Some("json"){
        let rows=a.db.query_all(stmt(&a.db,"SELECT data FROM events WHERE project_id=? AND sequence<=? ORDER BY sequence",vec![id.into(),p.version.into()])).await?;
        let events=rows.iter().map(|r|Ok(serde_json::from_str::<JsonValue>(&col(r,"data")?)?)).collect::<Result<Vec<_>>>()?;
        return Ok(Json(json!({"format":"todo-project","schema_version":1,"sequence":p.version,"name":p.name,"state":p.state,"users":all_users(&a).await?,"history":events})).into_response());
    }
    let users=all_users(&a).await?;let mut tasks=p.state.tasks;
    for task in &mut tasks{for owner in &mut task.owners{if let Some(u)=users.iter().find(|u|u.id==*owner){owner_by_name(&u.username,&users)?;*owner=u.username.clone();}}}
    Ok(([(header::CONTENT_TYPE,"text/markdown; charset=utf-8"),(header::CONTENT_DISPOSITION,"attachment; filename=TODO.md")],markdown::render(&tasks,&p.state.preamble).map_err(bad)?).into_response())
}
#[utoipa::path(get,path="/api/session/events",security(("session"=[])),responses((status=101,description="Session validity; close code 4001 requires immediate removal of local project data")))]
async fn session_events(State(a):State<App>,headers:HeaderMap,upgrade:WebSocketUpgrade)->Result<Response>{
    check_origin(&a,&headers)?;session(&a,&headers,false).await?;
    if a.signal.receiver_count()>=a.config.ws_limit{return Err(ApiError(StatusCode::TOO_MANY_REQUESTS,"The live connection limit was reached. Try again.".into()));}
    let mut signal=a.signal.subscribe();
    Ok(upgrade.max_message_size(4096).on_upgrade(move|mut socket|async move{
        let mut timer=tokio::time::interval(Duration::from_millis(500));
        loop{
            if session(&a,&headers,false).await.is_err(){let _=socket.send(Message::Close(Some(axum::extract::ws::CloseFrame{code:4001,reason:"Sign in to continue.".into()}))).await;break;}
            tokio::select!{
                _=timer.tick()=>{if socket.send(Message::Ping(vec![].into())).await.is_err(){break;}},
                _=signal.recv()=>{},
                received=socket.recv()=>{match received{Some(Ok(Message::Pong(_)))=>{},Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,_=>break}}
            }
        }
    }).into_response())
}

#[derive(Deserialize)]
struct EventQuery { after:Option<i64> }
#[utoipa::path(get,path="/api/projects/{project}/events",params(("project"=String,Path),("after"=Option<i64>,Query)),security(("session"=[])),responses((status=101,description="Project events; send each sequence as after on reconnect")))]
async fn events(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Query(q):Query<EventQuery>,upgrade:WebSocketUpgrade)->Result<Response>{
    check_origin(&a,&headers)?;let s=session(&a,&headers,false).await?;load(&a,&id,&s.user,false).await?;
    if a.signal.receiver_count()>=a.config.ws_limit{return Err(ApiError(StatusCode::TOO_MANY_REQUESTS,"The live connection limit was reached. Try again.".into()));}
    let token=cookie(&headers,"todo_session").unwrap();let mut signal=a.signal.subscribe();
    Ok(upgrade.max_message_size(4096).on_upgrade(move|mut socket|async move{
        let mut after=q.after.unwrap_or(0);let mut timer=tokio::time::interval(Duration::from_millis(500));
        loop{
            if read_session(&a,&token).await.is_err() || load(&a,&id,&s.user,false).await.is_err(){let _=socket.send(Message::Close(None)).await;break;}
            let query=stmt(&a.db,"SELECT data FROM events WHERE project_id=? AND sequence>? ORDER BY sequence LIMIT 100",vec![id.clone().into(),after.into()]);
            let Ok(rows)=a.db.query_all(query).await else{break;};
            let mut failed=false;
            for row in rows{let Ok(data)=col(&row,"data")else{failed=true;break;};let Ok(e)=serde_json::from_str::<History>(&data)else{failed=true;break;};
                after=e.sequence;let notice=json!({"sequence":e.sequence,"task_id":e.task_id,"action":e.action}).to_string();
                if tokio::time::timeout(Duration::from_secs(5),socket.send(Message::Text(notice.into()))).await.is_err(){failed=true;break;}
            }
            if failed{break;}
            tokio::select!{
                _=timer.tick()=>{if socket.send(Message::Ping(vec![].into())).await.is_err(){break;}},
                _=signal.recv()=>{},
                received=socket.recv()=>{match received{Some(Ok(Message::Pong(_)))=>{},Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,_=>{let _=socket.send(Message::Close(None)).await;break;}}}
            }
        }
    }).into_response())
}

#[derive(Deserialize)]
struct DiagramQuery { format:Option<String>, tasks:Option<String>, today:Option<chrono::NaiveDate>, week_start:Option<chrono::DateTime<Utc>>, week_end:Option<chrono::DateTime<Utc>> }
#[utoipa::path(get,path="/api/projects/{project}/diagram",params(("project"=String,Path),("format"=Option<String>,Query),("tasks"=Option<String>,Query),("today"=Option<String>,Query),("week_start"=Option<String>,Query),("week_end"=Option<String>,Query)),security(("session"=[])),responses((status=200,description="Original task-tree SVG or interactive HTML")))]
async fn diagram(State(a):State<App>,headers:HeaderMap,Path(id):Path<String>,Query(q):Query<DiagramQuery>)->Result<Response>{
    use chrono::Datelike;
    let s=session(&a,&headers,false).await?;let p=load(&a,&id,&s.user,false).await?;
    let selected=q.tasks.map(|value|value.split(',').map(String::from).collect::<HashSet<_>>());
    if selected.as_ref().is_some_and(|ids|ids.iter().any(|id|!p.state.tasks.iter().any(|task|&task.id==id))){return Err(bad("The diagram contains a task outside the selected project."));}
    let tasks=p.state.tasks.iter().filter(|task|selected.as_ref().is_none_or(|ids|ids.contains(&task.id))).cloned().collect::<Vec<_>>();
    if tasks.is_empty(){return Err(bad("Select at least one task to draw the tree."));}
    let today=q.today.unwrap_or_else(||Utc::now().date_naive());
    let monday=today-chrono::Duration::days(today.weekday().num_days_from_monday().into());
    let default_start=monday.and_hms_opt(0,0,0).unwrap().and_utc();
    let (week_start,week_end)=match(q.week_start,q.week_end){
        (Some(start),Some(end))=>(start,end),
        (None,None)=>(default_start,default_start+chrono::Duration::days(7)),
        _=>return Err(bad("Provide both calendar-week boundaries or leave both unset.")),
    };
    if week_end-week_start<chrono::Duration::days(6)||week_end-week_start>chrono::Duration::days(8)||(week_start.date_naive()-monday).num_days().abs()>1{return Err(bad("Choose calendar-week boundaries around the selected local Monday."));}
    let rows=a.db.query_all(stmt(&a.db,"SELECT data FROM events WHERE project_id=? ORDER BY sequence",vec![id.into()])).await?;
    let mut worked=HashSet::new();
    for row in rows{
        let event:History=serde_json::from_str(&col(&row,"data")?)?;
        if ["task_created","task_saved","task_restored","task_moved"].contains(&event.action.as_str()) && chrono::DateTime::parse_from_rfc3339(&event.at).ok().is_some_and(|at|at>=week_start&&at<week_end) {
            if let Some(task)=tasks.iter().find(|task|task.id==event.task_id){worked.insert(task.title.to_lowercase().chars().map(|c|if c.is_ascii_alphanumeric(){c}else{' '}).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" "));}
        }
    }
    let mut worked=worked.into_iter().collect::<Vec<_>>();worked.sort();
    let drawing=a.renderer.draw(&json!({"tasks":tasks,"today":today,"worked":worked})).await.map_err(|message|{tracing::error!(error=%message,"Task-tree rendering failed");ApiError(StatusCode::SERVICE_UNAVAILABLE,"The task tree could not be drawn. Try again shortly.".into())})?;
    if q.format.as_deref()==Some("svg"){return Ok(([(header::CONTENT_TYPE,"image/svg+xml; charset=utf-8")],drawing.svg.clone()).into_response());}
    if q.format.as_deref().is_some_and(|format|!["html","interactive"].contains(&format)){return Err(bad("Choose SVG or HTML for the diagram."));}
    let html=drawing.html.clone();
    let script=drawing.html.split_once("<script type=\"module\">").and_then(|(_,rest)|rest.split_once("</script>")).map(|(script,_)|script).ok_or_else(||bad("The task-tree page has no renderer script."))?;
    use base64::engine::general_purpose::STANDARD;
    let policy=format!("default-src 'self'; script-src 'self' 'sha256-{}'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",STANDARD.encode(Sha256::digest(script.as_bytes())));
    Ok(([(header::CONTENT_TYPE,"text/html; charset=utf-8"),(header::CONTENT_SECURITY_POLICY,policy.as_str()),(header::X_FRAME_OPTIONS,"DENY")],html).into_response())
}

#[derive(rust_embed::RustEmbed)]
#[folder="frontend/dist/"]
struct Assets;
fn entry_html(a:&App,error:Option<&str>)->Option<String>{
    let file=Assets::get("index.html")?;
    let escape=|text:&str|text.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('"',"&quot;").replace('\'',"&#39;");
    let metadata=format!("<head><meta name=\"app-base\" content=\"{}\">{}",a.config.base_path,error.map(|error|format!("<meta name=\"auth-error\" content=\"{}\">",escape(error))).unwrap_or_default());
    Some(String::from_utf8_lossy(&file.data).replacen("<head>",&metadata,1).replace("src=\"./",&format!("src=\"{}/",a.config.base_path)).replace("href=\"./",&format!("href=\"{}/",a.config.base_path)))
}
async fn assets(State(a):State<App>,uri:axum::http::Uri)->Response{
    let path=uri.path().trim_start_matches('/');
    let asset=Assets::get(if path.is_empty(){"index.html"}else{path});
    if path.is_empty() || path=="index.html" { if let Some(html)=entry_html(&a,None) {return ([(header::CONTENT_TYPE,"text/html; charset=utf-8")],html).into_response();} }
    if let Some(file)=asset{let mime=mime_guess::from_path(if path.is_empty(){"index.html"}else{path}).first_or_octet_stream();return ([(header::CONTENT_TYPE,mime.as_ref())],file.data.into_owned()).into_response();}
    StatusCode::NOT_FOUND.into_response()
}
#[derive(OpenApi)]
#[openapi(paths(health,login,callback,logout,provider_logout,me,session_events,users,projects,create_project,project_info,rename_project,delete_project,load_project,members,set_member,tasks,create_task,save_task,move_task,revert,history,import,import_json,sprints,save_sprint,export,events,diagram),components(schemas(Task,User,History,Project,Snapshot,Sprint,NewProject,RenameProject,DeleteProject,LoadProject,MemberChange,SaveTask,MoveTask,Revert,Import,JsonImport,SaveSprint)))]
struct ApiDoc;
pub fn openapi()->String{
    let mut spec=ApiDoc::openapi();
    spec.info.title="Task Management API".into();spec.info.version=env!("CARGO_PKG_VERSION").into();
    spec.components.get_or_insert_with(Default::default).add_security_scheme("session",utoipa::openapi::security::SecurityScheme::ApiKey(utoipa::openapi::security::ApiKey::Cookie(utoipa::openapi::security::ApiKeyValue::new("todo_session"))));
    spec.to_pretty_json().unwrap()
}
async fn api_spec(State(a):State<App>)->Response{let mut spec:JsonValue=serde_json::from_str(&openapi()).unwrap();spec["servers"]=json!([{"url":format!("{}/",a.config.base_path)}]);([(header::CONTENT_TYPE,"application/json")],spec.to_string()).into_response()}
async fn api_docs(State(a):State<App>)->Response{
    ([(header::CONTENT_TYPE,"text/html; charset=utf-8")],"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>API Reference</title><link rel=stylesheet href=/api-reference.css><main><h1>Task Management API</h1><p>Generated from the Rust handlers and data types. Sign in to execute requests with the current session.</p><a href=/api/openapi.json download=openapi.json>Download OpenAPI</a><section id=operations></section><h2>Execute Request</h2><form id=request><label>Method<select name=method><option>GET</option><option>POST</option><option>DELETE</option></select></label><label>Path<input name=path value=/api/projects required></label><label>JSON body<textarea name=body>{}</textarea></label><button>Execute</button></form><pre id=result></pre><a href=/>Back to Tasks</a></main><script type=module src=/api-reference.js></script></html>".replace("<meta charset=utf-8>",&format!("<meta charset=utf-8><meta name=app-base content=\"{}\">",a.config.base_path)).replace("href=/",&format!("href={}/",a.config.base_path)).replace("src=/",&format!("src={}/",a.config.base_path))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn stored_project()->(App,HeaderMap,User,String,Task,History){
        let mut options=sea_orm::ConnectOptions::new("sqlite::memory:");options.max_connections(1);
        let db=Database::connect(options).await.unwrap();
        for query in [
            "CREATE TABLE people (id VARCHAR(64) PRIMARY KEY, data TEXT NOT NULL)",
            "CREATE TABLE sessions (id VARCHAR(64) PRIMARY KEY, data TEXT NOT NULL, expires BIGINT NOT NULL)",
            "CREATE TABLE projects (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, state TEXT NOT NULL, version BIGINT NOT NULL)",
            "CREATE TABLE events (id VARCHAR(64) PRIMARY KEY, project_id VARCHAR(64) NOT NULL, sequence BIGINT NOT NULL, task_id VARCHAR(64) NOT NULL, data TEXT NOT NULL, UNIQUE(project_id, sequence))",
        ]{db.execute(stmt(&db,query,vec![])).await.unwrap();}
        let (signal,_)=broadcast::channel(8);
        let config=Config{origin:"http://unit.invalid".into(),base_path:String::new(),issuer:"https://identity.invalid/".into(),identity_issuer:"https://identity.invalid/".into(),internal_oidc:String::new(),client_id:"test-client".into(),client_secret:"test-only".into(),insecure:true,ttl:600,max_bytes:1048576,ws_limit:10,role_claim:"groups".into(),role_map:HashMap::from([("test-editor".into(),"editor".into()),("test-admin".into(),"admin".into())]),subject_roles:HashMap::new(),sprint_days:14,enforce_dependencies:true,requests_per_minute:6000,max_tree_depth:64};
        let app=App{db,config:Arc::new(config),client:reqwest::Client::new(),signal,rates:Arc::new(tokio::sync::Mutex::new(HashMap::new())),renderer:Arc::new(crate::renderer::Renderer::default()),project_lock:Arc::new(tokio::sync::Mutex::new(()))};
        let user=User{id:"actor".into(),username:"editor".into(),role:"editor".into()};
        app.db.execute(stmt(&app.db,"INSERT INTO people (id,data) VALUES (?,?)",vec![user.id.clone().into(),serde_json::to_string(&user).unwrap().into()])).await.unwrap();
        let token=random();let csrf=random();put_session(&app,&token,serde_json::to_value(Session{user:user.clone(),csrf:csrf.clone(),subject:"test-subject".into(),groups:vec!["test-editor".into()]}).unwrap(),600).await.unwrap();
        let mut headers=HeaderMap::new();headers.insert(header::COOKIE,format!("todo_session={token}").parse().unwrap());headers.insert(header::ORIGIN,"http://unit.invalid".parse().unwrap());headers.insert("x-csrf-token",csrf.parse().unwrap());
        let project=uuid::Uuid::new_v4().to_string();let mut task=Task::default();task.title="Current title".into();task.description="Current description".into();task.version=2;task.owners=vec![user.id.clone()];
        let mut past=task.clone();past.title="Earlier title".into();past.version=1;past.owners=vec!["unregistered-source-owner".into()];
        let state=ProjectState{tasks:vec![task.clone()],members:BTreeMap::from([(user.id.clone(),"member".into())]),..Default::default()};
        app.db.execute(stmt(&app.db,"INSERT INTO projects (id,name,state,version) VALUES (?,?,?,?)",vec![project.clone().into(),"Project".into(),serde_json::to_string(&state).unwrap().into(),2i64.into()])).await.unwrap();
        let revision=History{id:random(),project_id:project.clone(),sequence:1,task_id:task.id.clone(),actor:user.clone(),at:stamp(),action:"history_imported:task_saved".into(),fields:vec!["title".into(),"owners".into()],before:JsonValue::Null,after:json!(past),imported_by:Some(user.clone()),source_revision_id:Some("source-revision".into())};
        insert_event(&app.db,&revision).await.unwrap();
        insert_event(&app.db,&History{id:random(),project_id:project.clone(),sequence:2,task_id:task.id.clone(),actor:user.clone(),at:stamp(),action:"task_saved".into(),fields:vec!["title".into(),"owners".into()],before:json!(past),after:json!(task),imported_by:None,source_revision_id:None}).await.unwrap();
        (app,headers,user,project,task,revision)
    }
    async fn admin_session(app:&App,user:&User)->(HeaderMap,User){
        let mut admin=user.clone();admin.role="admin".into();let token=random();let csrf=random();
        put_session(app,&token,serde_json::to_value(Session{user:admin.clone(),csrf:csrf.clone(),subject:"test-admin-subject".into(),groups:vec!["test-admin".into()]}).unwrap(),600).await.unwrap();
        let mut headers=HeaderMap::new();headers.insert(header::COOKIE,format!("todo_session={token}").parse().unwrap());headers.insert(header::ORIGIN,"http://unit.invalid".parse().unwrap());headers.insert("x-csrf-token",csrf.parse().unwrap());(headers,admin)
    }
    #[tokio::test]
    async fn f1_f3_f8_load_and_delete_are_atomic_title_based_and_administrator_controlled(){
        let (app,editor_headers,editor,project,_,_)=stored_project().await;
        let (headers,admin)=admin_session(&app,&editor).await;
        let source="# Loaded Project\n\n- ⬜M2 Team Success - Display Business Results #team-success\n\n# team-success Team Success\n\n## Details\n\nRetain **complete** text.\n\n- Nested content\n  - Preserved child\n";
        let loaded=load_project(State(app.clone()),headers.clone(),Json(LoadProject{source:source.into(),expected_versions:BTreeMap::new()})).await.unwrap().0;
        assert_eq!(loaded["created"],true);let id=loaded["project"]["id"].as_str().unwrap().to_owned();
        let saved=load(&app,&id,&admin,false).await.unwrap();assert_eq!(saved.name,"Loaded Project");assert_eq!(saved.state.tasks.len(),1);assert_eq!(saved.state.tasks[0].details,"## Details\n\nRetain **complete** text.\n\n- Nested content\n  - Preserved child");
        let versions=BTreeMap::from([(id.clone(),saved.version)]);
        let merged=load_project(State(app.clone()),headers.clone(),Json(LoadProject{source:"# Loaded Project\n\n- 📄H1 Other - Keep Existing Tasks #other".into(),expected_versions:versions.clone()})).await.unwrap().0;
        assert_eq!(merged["created"],false);let current=load(&app,&id,&admin,false).await.unwrap();assert_eq!(current.state.tasks.len(),2);assert_eq!(current.state.tasks[0],saved.state.tasks[0]);
        assert!(matches!(load_project(State(app.clone()),headers.clone(),Json(LoadProject{source:source.into(),expected_versions:versions})).await,Err(ApiError(StatusCode::CONFLICT,_))));
        assert!(matches!(load_project(State(app.clone()),headers.clone(),Json(LoadProject{source:"# Invalid Project\n\n- ⬜M1 20260230 Wrong - Invalid Date".into(),expected_versions:BTreeMap::new()})).await,Err(ApiError(StatusCode::BAD_REQUEST,_))));
        assert!(project_named(&app,"Invalid Project").await.unwrap().is_none());
        assert!(matches!(create_project(State(app.clone()),editor_headers.clone(),Json(NewProject{name:"Editor Project".into()})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        assert!(matches!(rename_project(State(app.clone()),editor_headers.clone(),Path(project.clone()),Json(RenameProject{name:"Editor Rename".into(),expected_sequence:2})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        assert!(matches!(delete_project(State(app.clone()),editor_headers,Path(project),Json(DeleteProject{expected_sequence:2})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        let mut forged=headers.clone();forged.remove("x-csrf-token");assert!(matches!(delete_project(State(app.clone()),forged,Path(id.clone()),Json(DeleteProject{expected_sequence:current.version})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        assert!(matches!(delete_project(State(app.clone()),headers.clone(),Path(id.clone()),Json(DeleteProject{expected_sequence:saved.version})).await,Err(ApiError(StatusCode::CONFLICT,_))));
        assert_eq!(load(&app,&id,&admin,false).await.unwrap().version,current.version);
        assert_eq!(delete_project(State(app.clone()),headers,Path(id.clone()),Json(DeleteProject{expected_sequence:current.version})).await.unwrap().0["deleted"],true);
        assert!(app.db.query_one(stmt(&app.db,"SELECT id FROM projects WHERE id=?",vec![id.clone().into()])).await.unwrap().is_none());
        assert!(app.db.query_all(stmt(&app.db,"SELECT id FROM events WHERE project_id=?",vec![id.into()])).await.unwrap().is_empty());
    }
    #[tokio::test]
    async fn f1_browser_signin_errors_retain_status_and_the_application_entry(){
        let (app,mut headers,_,_,_,_)=stored_project().await;
        headers.insert(header::ACCEPT,"text/html".parse().unwrap());
        let response=callback(State(app.clone()),headers,Query(Callback{code:None,state:None,error:Some("access_denied".into())})).await.into_response();
        assert_eq!(response.status(),StatusCode::BAD_REQUEST);
        assert_eq!(response.headers()[header::CONTENT_TYPE],"text/html; charset=utf-8");
        let body=axum::body::to_bytes(response.into_body(),1048576).await.unwrap();
        let html=String::from_utf8(body.to_vec()).unwrap();
        assert!(html.contains("name=\"auth-error\""));assert!(html.contains("Sign-in was declined"));assert!(html.contains("id=\"root\""));
        let response=callback(State(app),HeaderMap::new(),Query(Callback{code:None,state:None,error:Some("access_denied".into())})).await.into_response();
        assert_eq!(response.status(),StatusCode::BAD_REQUEST);assert_eq!(response.headers()[header::CONTENT_TYPE],"application/json");
    }
    #[tokio::test]
    async fn f1_logout_remains_available_after_role_removal_and_checks_csrf(){
        let (mut app,headers,_,_,_,_)=stored_project().await;
        Arc::get_mut(&mut app.config).unwrap().role_map.clear();
        assert!(matches!(me(State(app.clone()),headers.clone()).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        let mut forged=headers.clone();forged.remove("x-csrf-token");
        assert!(matches!(logout(State(app.clone()),forged).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        let mut foreign=headers.clone();foreign.insert(header::ORIGIN,"http://foreign.invalid".parse().unwrap());
        assert!(matches!(logout(State(app.clone()),foreign).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        let response=logout(State(app.clone()),headers.clone()).await.unwrap();
        assert_eq!(response.status(),StatusCode::OK);
        assert!(response.headers()[header::SET_COOKIE].to_str().unwrap().contains("Max-Age=0"));
        assert!(matches!(read_session(&app,&cookie(&headers,"todo_session").unwrap()).await,Err(ApiError(StatusCode::UNAUTHORIZED,_))));
    }
    #[tokio::test]
    async fn f1_expired_and_revoked_sessions_refuse_all_authenticated_reads(){
        let (app,headers,_,project,_,_)=stored_project().await;
        let info=me(State(app.clone()),headers.clone()).await.unwrap().0;assert!(info["session_expires_at"].as_i64().unwrap()>info["server_time"].as_i64().unwrap());
        let token=cookie(&headers,"todo_session").unwrap();app.db.execute(stmt(&app.db,"UPDATE sessions SET expires=0 WHERE id=?",vec![hash(&token).into()])).await.unwrap();
        assert!(matches!(me(State(app.clone()),headers.clone()).await,Err(ApiError(StatusCode::UNAUTHORIZED,_))));
        assert!(matches!(project_info(State(app.clone()),headers.clone(),Path(project.clone())).await,Err(ApiError(StatusCode::UNAUTHORIZED,_))));
        app.db.execute(stmt(&app.db,"UPDATE sessions SET expires=? WHERE id=?",vec![(Utc::now().timestamp()+600).into(),hash(&token).into()])).await.unwrap();
        assert!(logout(State(app.clone()),headers.clone()).await.is_ok());
        assert!(matches!(project_info(State(app),headers,Path(project)).await,Err(ApiError(StatusCode::UNAUTHORIZED,_))));
    }

    #[tokio::test]
    async fn f12_subtree_moves_persist_order_history_and_reject_stale_or_cyclic_changes(){
        let (mut app,headers,user,project,root,_)=stored_project().await;
        let source=format!("# Project\n\n- ⬜M1 Parent - Parent Work #{}\n  - ⬜H2 Child - Child Work #child\n    - 📄L1 Leaf - Leaf Work #leaf\n- ⏳M3 Other - Other Work #other\n",root.reference);
        assert!(import(State(app.clone()),headers.clone(),Path(project.clone()),Json(Import{markdown:source,mode:"replace".into(),dry_run:false,expected_sequence:Some(2)})).await.unwrap().0["imported"].as_u64().is_some_and(|count|count>0));
        let current=load(&app,&project,&user,false).await.unwrap();
        let child=current.state.tasks.iter().find(|t|t.reference=="child").unwrap().clone();
        let other=current.state.tasks.iter().find(|t|t.reference=="other").unwrap().clone();
        let leaf=current.state.tasks.iter().find(|t|t.reference=="leaf").unwrap().clone();
        let moved=move_task(State(app.clone()),headers.clone(),Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:None,before_id:Some(root.id.clone()),expected_sequence:current.version})).await.unwrap().0;
        assert!(moved.iter().any(|t|t.id==child.id&&t.parent_id.is_none()));
        let saved=load(&app,&project,&user,false).await.unwrap();
        let mut roots=saved.state.tasks.iter().filter(|t|t.parent_id.is_none()).collect::<Vec<_>>();roots.sort_by_key(|t|t.order);
        assert_eq!(roots.iter().map(|t|t.id.as_str()).collect::<Vec<_>>(),vec![child.id.as_str(),root.id.as_str(),other.id.as_str()]);
        assert_eq!(saved.state.tasks.iter().find(|t|t.id==leaf.id).unwrap(),&leaf);
        let events=history(State(app.clone()),headers.clone(),Path(project.clone()),Query(HistoryQuery{task_id:Some(child.id.clone()),before:None})).await.unwrap().0;
        assert_eq!(events[0].action,"task_moved");assert_eq!(events[0].actor.id,user.id);assert_eq!(events[0].before["parent_id"],root.id);assert!(events[0].after["parent_id"].is_null());
        let stale=move_task(State(app.clone()),headers.clone(),Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:Some(other.id.clone()),before_id:None,expected_sequence:current.version})).await;
        assert!(matches!(stale,Err(ApiError(StatusCode::CONFLICT,_))));
        let cycle=move_task(State(app.clone()),headers.clone(),Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:Some(leaf.id.clone()),before_id:None,expected_sequence:saved.version})).await;
        assert!(matches!(cycle,Err(ApiError(StatusCode::BAD_REQUEST,_))));
        let wrong_sibling=move_task(State(app.clone()),headers.clone(),Path((project.clone(),other.id.clone())),Json(MoveTask{parent_id:None,before_id:Some(leaf.id.clone()),expected_sequence:saved.version})).await;
        assert!(matches!(wrong_sibling,Err(ApiError(StatusCode::BAD_REQUEST,_))));
        assert_eq!(load(&app,&project,&user,false).await.unwrap().version,saved.version);
        let noop=move_task(State(app.clone()),headers.clone(),Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:None,before_id:Some(root.id.clone()),expected_sequence:saved.version})).await.unwrap().0;
        assert!(noop.is_empty());assert_eq!(load(&app,&project,&user,false).await.unwrap().version,saved.version);
        Arc::get_mut(&mut app.config).unwrap().max_tree_depth=2;
        let too_deep=move_task(State(app.clone()),headers.clone(),Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:Some(other.id.clone()),before_id:None,expected_sequence:saved.version})).await;
        assert!(matches!(too_deep,Err(ApiError(StatusCode::BAD_REQUEST,_))));assert_eq!(load(&app,&project,&user,false).await.unwrap().version,saved.version);
        let mut forged=headers.clone();forged.insert("x-csrf-token","invalid".parse().unwrap());
        assert!(matches!(move_task(State(app.clone()),forged,Path((project.clone(),child.id.clone())),Json(MoveTask{parent_id:None,before_id:None,expected_sequence:saved.version})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
        app.db.execute(stmt(&app.db,"UPDATE projects SET state=? WHERE id=?",vec![serde_json::to_string(&ProjectState{members:BTreeMap::new(),..saved.state.clone()}).unwrap().into(),project.clone().into()])).await.unwrap();
        assert!(matches!(move_task(State(app.clone()),headers,Path((project,child.id)),Json(MoveTask{parent_id:None,before_id:None,expected_sequence:saved.version})).await,Err(ApiError(StatusCode::FORBIDDEN,_))));
    }
    #[tokio::test]
    async fn f3_project_names_use_document_titles_for_existing_data_and_atomic_imports(){
        let (app,_headers,user,project,task,_)=stored_project().await;
        let (headers,user)=admin_session(&app,&user).await;
        let mut state=load(&app,&project,&user,false).await.unwrap().state;state.preamble="# Existing Document\n\nMetadata".into();
        app.db.execute(stmt(&app.db,"UPDATE projects SET state=? WHERE id=?",vec![serde_json::to_string(&state).unwrap().into(),project.clone().into()])).await.unwrap();
        assert_eq!(load(&app,&project,&user,false).await.unwrap().name,"Existing Document");
        assert_eq!(projects(State(app.clone()),headers.clone()).await.unwrap().0[0].name,"Existing Document");
        let source=format!("```md\n# Example Heading\n```\n\n# Imported **Document**\n\nMetadata\n\n- ⬜M1 Work - Preserve the Task #{}",task.reference);
        assert!(import(State(app.clone()),headers.clone(),Path(project.clone()),Json(Import{markdown:source,mode:"replace".into(),dry_run:false,expected_sequence:Some(2)})).await.unwrap().0["imported"].as_u64().is_some_and(|count|count>0));
        let current=load(&app,&project,&user,false).await.unwrap();assert_eq!(current.name,"Imported Document");assert!(current.state.preamble.contains("# Imported **Document**"));
        let row=app.db.query_one(stmt(&app.db,"SELECT name FROM projects WHERE id=?",vec![project.clone().into()])).await.unwrap().unwrap();assert_eq!(col(&row,"name").unwrap(),"Imported Document");
        let response=export(State(app.clone()),headers.clone(),Path(project.clone()),Query(ExportQuery{format:Some("json".into())})).await.unwrap();let bytes=axum::body::to_bytes(response.into_body(),1048576).await.unwrap();let mut document:JsonValue=serde_json::from_slice(&bytes).unwrap();
        document["name"]=json!("Obsolete Alias");document["state"]["preamble"]=json!("JSON Document\n=============\n\nMetadata");
        assert!(import_json(State(app.clone()),headers.clone(),Path(project.clone()),Json(JsonImport{document,mode:"replace".into(),dry_run:false,expected_sequence:Some(current.version)})).await.unwrap().0["imported"].as_u64().is_some_and(|count|count>0));
        let current=load(&app,&project,&user,false).await.unwrap();assert_eq!(current.name,"JSON Document");
        let revisions=history(State(app.clone()),headers.clone(),Path(project.clone()),Query(HistoryQuery{task_id:None,before:None})).await.unwrap().0;
        assert!(revisions.iter().any(|event|event.before["name"]=="Imported Document"&&event.after["name"]=="JSON Document"&&event.fields.contains(&"name".into())));
        let before=current.version;
        let invalid=import(State(app.clone()),headers.clone(),Path(project.clone()),Json(Import{markdown:format!("# {}\n\n- ⬜M1 Work - Preserve the Task #{}","x".repeat(256),task.reference),mode:"replace".into(),dry_run:false,expected_sequence:Some(before)})).await;
        assert!(matches!(invalid,Err(ApiError(StatusCode::BAD_REQUEST,_))));assert_eq!(load(&app,&project,&user,false).await.unwrap().version,before);
        let renamed=rename_project(State(app.clone()),headers.clone(),Path(project.clone()),Json(RenameProject{name:"Renamed Document".into(),expected_sequence:before})).await.unwrap().0;
        let renamed_state=load(&app,&project,&user,false).await.unwrap();assert_eq!(renamed.name,"Renamed Document");assert_eq!(renamed_state.state.preamble,"# Renamed Document\n\nMetadata");
        let created=create_project(State(app.clone()),headers,Json(NewProject{name:"Created **Document**".into()})).await.unwrap().0;assert_eq!(created.name,"Created **Document**");assert_eq!(load(&app,&created.id,&user,false).await.unwrap().name,created.name);
    }
    #[tokio::test]
    async fn f8_restoring_unknown_owners_is_rejected_without_changing_persisted_state(){
        let (app,headers,user,project,task,revision)=stored_project().await;
        let denied=revert(State(app.clone()),headers.clone(),Path((project.clone(),task.id.clone())),Json(Revert{revision_id:revision.id.clone(),fields:vec!["owners".into()],expected_version:task.version})).await;
        assert!(matches!(&denied,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Restore response: {denied:?}");
        let unchanged=load(&app,&project,&user,false).await.unwrap();assert_eq!(unchanged.state.tasks[0],task);assert_eq!(unchanged.version,2);
        let count=app.db.query_one(stmt(&app.db,"SELECT COUNT(*) AS amount FROM events WHERE project_id=?",vec![project.clone().into()])).await.unwrap().unwrap();assert_eq!(count.try_get::<i64>("","amount").unwrap(),2);
        let restored=revert(State(app.clone()),headers,Path((project.clone(),task.id.clone())),Json(Revert{revision_id:revision.id,fields:vec!["title".into()],expected_version:task.version})).await.unwrap().0;
        assert_eq!(restored.title,"Earlier title");assert_eq!(restored.owners,task.owners);
        let stored=load(&app,&project,&user,false).await.unwrap();assert_eq!(stored.state.tasks[0],restored);assert_eq!(stored.version,3);
    }
    #[tokio::test]
    async fn f3_ambiguous_owner_names_require_json_identity_for_import_and_export(){
        let (app,headers,user,project,task,_)=stored_project().await;
        for id in ["first-identity","second-identity"]{let person=User{id:id.into(),username:"same-name".into(),role:"reader".into()};app.db.execute(stmt(&app.db,"INSERT INTO people (id,data) VALUES (?,?)",vec![person.id.clone().into(),serde_json::to_string(&person).unwrap().into()])).await.unwrap();}
        let mut loaded=load(&app,&project,&user,true).await.unwrap();let mut assigned=task.clone();assigned.owners=vec!["first-identity".into()];save(&app,&user,&mut loaded,assigned,task.version,false).await.unwrap();
        let markdown=export(State(app.clone()),headers.clone(),Path(project.clone()),Query(ExportQuery{format:Some("markdown".into())})).await;
        let preview=import(State(app.clone()),headers.clone(),Path(project.clone()),Json(Import{markdown:format!("- ⬜M1 Work - Description [same-name] #{}",task.reference),mode:"merge".into(),dry_run:true,expected_sequence:None})).await;
        assert!(matches!(&markdown,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Ambiguous Markdown export: {markdown:?}");
        assert!(matches!(&preview,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Ambiguous Markdown preview: {preview:?}");
        let response=export(State(app.clone()),headers.clone(),Path(project.clone()),Query(ExportQuery{format:Some("json".into())})).await.unwrap();let bytes=axum::body::to_bytes(response.into_body(),1048576).await.unwrap();let document:JsonValue=serde_json::from_slice(&bytes).unwrap();
        assert_eq!(document["state"]["tasks"][0]["owners"],json!(["first-identity"]));assert_eq!(document["users"].as_array().unwrap().iter().filter(|person|person["username"]=="same-name").count(),2);
        let sequence=document["sequence"].as_i64().unwrap();let imported=import_json(State(app.clone()),headers,Path(project.clone()),Json(JsonImport{document,mode:"merge".into(),dry_run:false,expected_sequence:Some(sequence)})).await.unwrap().0;assert_eq!(imported["imported"],1);
        let stored=load(&app,&project,&user,false).await.unwrap();assert_eq!(stored.state.tasks[0].owners,vec!["first-identity"]);assert_eq!(stored.state.members,BTreeMap::from([(user.id,"member".into())]));
    }
    #[test]
    fn f1_role_claims_and_environment_subject_assignments_have_explicit_precedence(){
        let roles=HashMap::from([("todo-admin".into(),"admin".into()),("todo-editor".into(),"editor".into()),("todo-reader".into(),"reader".into())]);
        let groups=vec!["todo-reader".into(),"todo-admin".into(),"todo-editor".into()];
        assert_eq!(configured_role("first-login",&groups,&roles,&HashMap::new()).unwrap(),"admin");
        let explicit=HashMap::from([("immutable-subject".into(),"reader".into())]);
        assert_eq!(configured_role("immutable-subject",&groups,&roles,&explicit).unwrap(),"reader");
        assert_eq!(configured_role("another-subject",&["todo-editor".into()],&roles,&explicit).unwrap(),"editor");
        assert!(configured_role("first-login",&[],&roles,&explicit).is_err());
        assert!(configured_role("display-name",&[],&roles,&explicit).is_err());
    }
    #[tokio::test]
    async fn f4_week_markers_follow_the_browser_calendar_across_utc_midnight(){
        let (app,headers,_,project,_,_)=stored_project().await;
        let row=app.db.query_one(stmt(&app.db,"SELECT data FROM events WHERE project_id=? AND sequence=2",vec![project.clone().into()])).await.unwrap().unwrap();
        let mut event:History=serde_json::from_str(&col(&row,"data").unwrap()).unwrap();
        for (at,blue) in [("2026-11-01T23:30:00Z",true),("2026-11-01T22:30:00Z",false)]{
            event.at=at.into();app.db.execute(stmt(&app.db,"UPDATE events SET data=? WHERE id=?",vec![serde_json::to_string(&event).unwrap().into(),event.id.clone().into()])).await.unwrap();
            let query=serde_json::from_value(json!({"format":"svg","today":"2026-11-02","week_start":"2026-11-01T23:00:00Z","week_end":"2026-11-08T23:00:00Z"})).unwrap();
            let response=diagram(State(app.clone()),headers.clone(),Path(project.clone()),Query(query)).await.unwrap();
            let bytes=axum::body::to_bytes(response.into_body(),16*1024*1024).await.unwrap();let svg=String::from_utf8(bytes.to_vec()).unwrap();
            let circle=svg.split("<circle ").nth(1).unwrap().split("</circle>").next().unwrap();
            assert_eq!(circle.contains("stroke=\"#2F6FD0\""),blue,"Task circle for {at}: {circle}");
        }
        let query=serde_json::from_value(json!({"format":"svg","today":"2026-11-02","week_start":"2026-10-01T23:00:00Z","week_end":"2026-12-08T23:00:00Z"})).unwrap();
        assert!(matches!(diagram(State(app),headers,Path(project),Query(query)).await,Err(ApiError(StatusCode::BAD_REQUEST,_))));
    }
    #[tokio::test]
    async fn f11_advisory_dependencies_preserve_cycle_checks_and_saved_history(){
        async fn snapshot(app:&App,headers:&HeaderMap,project:&str,user:&User)->(i64,JsonValue,JsonValue){
            let current=load(app,project,user,false).await.unwrap();
            let revisions=history(State(app.clone()),headers.clone(),Path(project.to_owned()),Query(HistoryQuery{task_id:None,before:None})).await.unwrap().0;
            (current.version,json!(current.state),json!(revisions))
        }
        let (mut app,headers,user,project,prerequisite,_)=stored_project().await;
        assert!(app.config.enforce_dependencies);assert_eq!(prerequisite.status,"open");
        let initial=snapshot(&app,&headers,&project,&user).await;
        let mut dependent=Task::default();dependent.id=uuid::Uuid::new_v4().to_string();dependent.reference="advisory-dependent".into();dependent.title="Advisory work".into();dependent.description="Retain the dependency policy".into();dependent.status="in_work".into();dependent.depends_on=vec![prerequisite.id.clone()];
        let denied=create_task(State(app.clone()),headers.clone(),Path(project.clone()),Json(SaveTask{task:dependent.clone(),expected_version:0})).await;
        assert!(matches!(&denied,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Enforced creation: {denied:?}");
        assert_eq!(snapshot(&app,&headers,&project,&user).await,initial);
        Arc::get_mut(&mut app.config).unwrap().enforce_dependencies=false;
        let created=create_task(State(app.clone()),headers.clone(),Path(project.clone()),Json(SaveTask{task:dependent,expected_version:0})).await.unwrap().0;
        let mut done=created.clone();done.status="done".into();
        let completed=save_task(State(app.clone()),headers.clone(),Path((project.clone(),created.id.clone())),Json(SaveTask{task:done,expected_version:created.version})).await.unwrap().0;
        let advisory=snapshot(&app,&headers,&project,&user).await;assert_eq!(advisory.0,4);
        let persisted=load(&app,&project,&user,false).await.unwrap();assert_eq!(persisted.state.tasks.iter().find(|task|task.id==created.id).unwrap(),&completed);
        let revisions=advisory.2.as_array().unwrap().iter().filter(|entry|entry["task_id"]==created.id).collect::<Vec<_>>();
        assert_eq!(revisions.len(),2);assert_eq!(revisions[0]["after"]["status"],"done");assert_eq!(revisions[0]["before"]["status"],"in_work");assert_eq!(revisions[1]["after"]["status"],"in_work");assert_eq!(revisions[1]["before"],JsonValue::Null);
        let mut cyclic=prerequisite.clone();cyclic.depends_on=vec![created.id.clone()];
        let denied=save_task(State(app.clone()),headers.clone(),Path((project.clone(),prerequisite.id.clone())),Json(SaveTask{task:cyclic,expected_version:prerequisite.version})).await;
        assert!(matches!(&denied,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Advisory cycle: {denied:?}");
        assert_eq!(snapshot(&app,&headers,&project,&user).await,advisory);
        Arc::get_mut(&mut app.config).unwrap().enforce_dependencies=true;
        let mut blocked=completed.clone();blocked.status="in_work".into();
        let denied=save_task(State(app.clone()),headers.clone(),Path((project.clone(),created.id)),Json(SaveTask{task:blocked,expected_version:completed.version})).await;
        assert!(matches!(&denied,Err(ApiError(code,_)) if *code==StatusCode::BAD_REQUEST),"Reenabled enforcement: {denied:?}");
        assert_eq!(snapshot(&app,&headers,&project,&user).await,advisory);
    }
}
