use crate::model::{Task, STATUSES, ICONS};
use std::collections::{HashMap, HashSet};
use regex::Regex;

pub struct Parsed { pub tasks: Vec<Task>, pub preamble: String }

fn unescape(text:&str)->String {
    let mut output=String::new();let mut chars=text.chars();
    while let Some(c)=chars.next(){if c=='\\'{match chars.next(){Some(next) if "\\[]-".contains(next)=>output.push(next),Some(next)=>{output.push(c);output.push(next);},None=>output.push(c)}}else{output.push(c);}}
    output
}
fn escape(text:&str)->String {text.replace('\\',"\\\\").replace('[',"\\[").replace(']',"\\]").replace(" - "," \\- ")}

pub fn validate_details(input:&str)->Result<(),String>{
    use pulldown_cmark::{Parser,Event,Tag,HeadingLevel};
    if Parser::new(input).any(|event|matches!(event,Event::Start(Tag::Heading{level:HeadingLevel::H1,..}))){return Err("Headings inside task details start at level two (##).".into());}
    Ok(())
}

fn trim_details(input:&str)->String{
    let lines=input.lines().collect::<Vec<_>>();
    let Some(first)=lines.iter().position(|line|!line.trim().is_empty())else{return String::new();};
    let last=lines.iter().rposition(|line|!line.trim().is_empty()).unwrap();
    lines[first..=last].join("\n")
}

pub fn parse(input: &str, existing: &HashMap<String, Task>) -> Result<Parsed, String> {
    let entry = Regex::new(r"^( *)(?:- )([⬜📄⏳🔀✅⏸❌])\u{fe0f}?([HML]?)([0-9]) (?:([0-9]{8}) )?(.+?) - (.+?)(?: \[([^\]]*)\])?(?: #([^\s]+))?(?: (\^))?\s*$").unwrap();
    let heading = Regex::new(r"^# ([^\s]+) (.+)$").unwrap();
    let mut tasks: Vec<Task> = vec![];
    let mut stack: Vec<String> = vec![];
    let mut refs = HashSet::new();
    let mut occurrences=HashMap::new();
    let mut chapters=HashSet::new();
    let mut preamble = String::new();
    let mut details: Option<usize> = None;
    let mut chapter_lines=HashSet::new();let mut protected=vec![];
    for (event,range) in pulldown_cmark::Parser::new(input).into_offset_iter(){
        let start=input[..range.start].rfind('\n').map(|i|i+1).unwrap_or(0);
        match event{
            pulldown_cmark::Event::Start(pulldown_cmark::Tag::Heading{level:pulldown_cmark::HeadingLevel::H1,..})=>{if input[start..].starts_with("# "){chapter_lines.insert(start);}},
            pulldown_cmark::Event::Start(pulldown_cmark::Tag::CodeBlock(_)|pulldown_cmark::Tag::HtmlBlock)=>protected.push(start..range.end),
            _=>{}
        }
    }
    protected.sort_by_key(|range|range.start);let mut protected_index=0;let mut offset=0;
    let mut list_started = false;
    let mut details_started = false;
    for (number, raw) in input.split_inclusive('\n').enumerate() {
        let line_start=offset;offset+=raw.len();
        let line=raw.trim_end_matches('\n').trim_end_matches('\r');let trimmed=line.trim_start();
        while protected_index<protected.len()&&protected[protected_index].end<=line_start{protected_index+=1;}
        let is_protected=protected.get(protected_index).is_some_and(|range|range.contains(&line_start));
        if list_started && chapter_lines.contains(&line_start) && let Some(h) = heading.captures(line) {
            let reference = &h[1];
            let index = tasks.iter().position(|t| t.reference == reference)
                .ok_or_else(|| format!("Line {}: detail heading references unknown task {reference}", number + 1))?;
            if !chapters.insert(reference.to_string()) { return Err(format!("Line {}: duplicate detail chapter", number + 1)); }
            details = Some(index); details_started = true; continue;
        }
        if let Some(i) = details { tasks[i].details.push_str(&format!("{line}\n")); continue; }
        if is_protected{
            if !list_started{preamble.push_str(&format!("{line}\n"));continue;}
            return Err(format!("Line {}: place text after the task tree in a detail chapter",number+1));
        }
        if let Some(c) = entry.captures(line) {
            if details_started { return Err(format!("Line {}: task occurs after detail chapters", number + 1)); }
            list_started = true;
            let depth = c[1].len() / 2;
            if c[1].len() % 2 != 0 || depth > stack.len() { return Err(format!("Line {}: use two spaces per tree level", number+1)); }
            stack.truncate(depth);
            let title=unescape(c[6].trim());
            let reference = c.get(9).map(|m| m.as_str().to_string()).unwrap_or_else(|| {
                let parent=stack.last().and_then(|id|tasks.iter().find(|task|&task.id==id)).map(|task|task.reference.clone());
                let occurrence=occurrences.entry((parent.clone(),title.clone())).or_insert(0usize);
                let key=serde_json::to_vec(&("todo-task",parent,&title,*occurrence)).unwrap();*occurrence+=1;
                format!("task-{}",uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL,&key))
            });
            if !refs.insert(reference.clone()) { return Err(format!("Line {}: duplicate task identifier {reference}", number+1)); }
            let mut task = existing.get(&reference).cloned().unwrap_or_else(|| Task { id: uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL,reference.as_bytes()).to_string(), ..Default::default() });
            task.reference = reference;
            task.parent_id = stack.last().cloned();
            task.status = STATUSES[ICONS.iter().position(|i| *i == &c[2]).unwrap()].into();
            task.priority = c[3].into(); task.complexity = c[4].parse().unwrap();
            task.due_date = c.get(5).map(|m| chrono::NaiveDate::parse_from_str(m.as_str(), "%Y%m%d").map(|d| d.to_string()))
                .transpose().map_err(|_| format!("Line {}: invalid due date", number+1))?;
            task.title = title; task.description = unescape(c[7].trim());
            task.owners = c.get(8).map(|m| m.as_str().split(',').map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect()).unwrap_or_default();
            task.next_week = c.get(10).is_some(); task.details.clear(); task.order = tasks.len() as i64;
            stack.push(task.id.clone()); tasks.push(task);
        } else if trimmed.starts_with("- ") && list_started || trimmed.starts_with("- ") && trimmed.chars().nth(2).is_some_and(|c| ICONS.iter().any(|i| i.starts_with(c))) {
            return Err(format!("Line {}: invalid task entry", number+1));
        } else if !list_started { preamble.push_str(&format!("{line}\n")); }
        else if !trimmed.is_empty() { return Err(format!("Line {}: expected a task or detail chapter", number+1)); }
    }
    if tasks.is_empty() { return Err("No task entries found; existing tasks were preserved".into()); }
    for task in &mut tasks { task.details = trim_details(&task.details); }
    Ok(Parsed { tasks, preamble: preamble.trim_end().to_string() })
}

pub fn render(tasks: &[Task], preamble: &str) -> Result<String,String> {
    fn children(out: &mut String, tasks: &[Task], parent: Option<&str>, depth: usize,visible:&mut HashSet<String>) {
        let mut items: Vec<_> = tasks.iter().filter(|t| t.parent_id.as_deref() == parent && !t.archived).collect();
        items.sort_by_key(|t| t.order);
        for t in items {
            visible.insert(t.id.clone());
            let icon = ICONS[STATUSES.iter().position(|s| *s == t.status).unwrap_or(0)];
            let due = t.due_date.as_ref().map(|d| format!("{} ", d.replace('-', ""))).unwrap_or_default();
            let title=if t.due_date.is_none()&&t.title.as_bytes().get(..8).is_some_and(|prefix|prefix.iter().all(|b|b.is_ascii_digit()))&&t.title.as_bytes().get(8)==Some(&b' '){format!(" {}",escape(&t.title))}else{escape(&t.title)};
            let owners = if t.owners.is_empty() { String::new() } else { format!(" [{}]", t.owners.join(",")) };
            out.push_str(&format!("{}- {icon}{}{} {due}{title} - {}{owners} #{}{}\n", "  ".repeat(depth), t.priority, t.complexity, escape(&t.description), t.reference, if t.next_week { " ^" } else { "" }));
            children(out, tasks, Some(&t.id), depth+1,visible);
        }
    }
    let mut output = format!("{}\n\n", if preamble.is_empty() { "# Task Tree" } else { preamble });
    let mut visible=HashSet::new();
    children(&mut output, tasks, None, 0,&mut visible);
    for t in tasks.iter().filter(|t| visible.contains(&t.id) && !t.details.is_empty()) {
        output.push_str(&format!("\n# {} {}\n\n{}\n", t.reference, t.title, t.details));
    }
    if !visible.is_empty(){
        let existing=tasks.iter().map(|task|(task.reference.clone(),task.clone())).collect::<HashMap<_,_>>();
        let decoded=parse(&output,&existing)?;
        for task in tasks.iter().filter(|task|visible.contains(&task.id)){
            let same=decoded.tasks.iter().find(|parsed|parsed.id==task.id).is_some_and(|parsed|parsed.title==task.title&&parsed.description==task.description&&parsed.parent_id==task.parent_id&&parsed.status==task.status&&parsed.priority==task.priority&&parsed.complexity==task.complexity&&parsed.due_date==task.due_date&&parsed.owners==task.owners&&parsed.reference==task.reference&&parsed.next_week==task.next_week&&parsed.details==trim_details(&task.details));
            if !same{return Err(format!("Task {} cannot be exported as TODO Markdown without changing its content. Complete its Markdown blocks or use JSON export.",task.reference));}
        }
    }
    Ok(output)
}
