FROM mwaeckerlin/very-base AS frontend
RUN $PKG_INSTALL nodejs npm python3
WORKDIR /app
RUN $ALLOW_BUILD /app
COPY --chown=coder:coder package.json package-lock.json ./
COPY --chown=coder:coder frontend/package.json frontend/package.json
USER coder
RUN test "$(id -u coder)" = 101 && test "$(id -g coder)" = 1001
RUN --mount=type=cache,target=/home/coder/.npm,uid=101,gid=1001 npm ci
COPY --chown=coder:coder frontend frontend
COPY --chown=coder:coder renderer/task-tree.py renderer/browser-module.py renderer/
RUN python3 renderer/browser-module.py
RUN npm run build -w @mwaeckerlin/todo-ui

FROM mwaeckerlin/very-base AS backend
RUN $PKG_INSTALL rust cargo gcc g++ musl-dev pkgconf
WORKDIR /app
RUN $ALLOW_BUILD /app
COPY --chown=coder:coder Cargo.toml Cargo.lock ./
COPY --chown=coder:coder src src
COPY --chown=coder:coder vendor vendor
COPY --chown=coder:coder tests/markdown.rs tests/markdown.rs
COPY --chown=coder:coder tests/fixtures tests/fixtures
COPY --from=frontend --chown=coder:coder /app/frontend/dist frontend/dist
USER coder
ENV CARGO_BUILD_JOBS=2
RUN --mount=type=cache,target=/home/coder/.cargo,uid=101,gid=1001 --mount=type=cache,target=/app/target,uid=101,gid=1001 TARGET=$(rustc -vV | sed -n 's/host: //p') && RUSTFLAGS="-C target-feature=+crt-static" cargo build --release --locked --target "$TARGET" && cp "target/$TARGET/release/todo" /app/todo

FROM mwaeckerlin/very-base AS renderer
RUN $PKG_INSTALL python3 py3-pip python3-dev gcc musl-dev freetype-dev jpeg-dev zlib-dev libwebp-dev tiff-dev openjpeg-dev lcms2-dev libraqm-dev fontconfig
WORKDIR /app
RUN $ALLOW_BUILD /app
COPY --chown=coder:coder renderer/requirements.txt renderer/requirements.txt
USER coder
ENV FONTCONFIG_FILE=/app/renderer/fonts.conf PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/pillow MAX_CONCURRENCY=2 PIP_CACHE_DIR=/home/coder/.cache/pip PIP_DISABLE_PIP_VERSION_CHECK=1
RUN --mount=type=cache,target=/home/coder/.cache/pip,uid=101,gid=1001 python3 -m pip install --target /app/pillow --no-binary=pillow --config-settings=raqm=enable -r renderer/requirements.txt
COPY --chown=coder:coder renderer renderer
RUN python3 -c "assert __import__('PIL.features',fromlist=['check']).check('raqm')"
RUN fc-cache -f
RUN python3 renderer/collect-runtime.py /app/runtime

FROM renderer AS renderer-audit
COPY --chown=coder:coder renderer/audit-requirements.txt renderer/audit-requirements.txt
RUN --mount=type=cache,target=/home/coder/.cache/pip,uid=101,gid=1001 python3 -m pip install --target /app/audit -r renderer/audit-requirements.txt
RUN PYTHONPATH=/app/audit:/app/pillow python3 -m pip_audit --path /app/pillow

FROM mwaeckerlin/scratch
ENV CONTAINERNAME="todo" RUST_LOG="info" PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/pillow
WORKDIR /app
EXPOSE 8080
COPY --from=renderer /app/runtime /
COPY --from=renderer /app/renderer renderer
COPY --from=backend /app/todo /usr/bin/todo
ENTRYPOINT ["/usr/bin/todo"]
