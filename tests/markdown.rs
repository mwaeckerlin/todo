use todo::markdown::{parse, render};
use std::collections::HashMap;

#[test]
fn f3_complex_open_source_sample_preserves_the_complete_tree() {
    let tree = parse(include_str!("fixtures/opensource.md"), &HashMap::new()).unwrap();
    assert!(tree.tasks.len() > 80);
    assert_eq!(tree.tasks.iter().filter(|task| task.parent_id.is_none()).count(), 7);
    assert_eq!(tree.tasks.iter().map(|task| format!("{:?}", task.status)).collect::<std::collections::HashSet<_>>().len(), 7);
    assert!(tree.tasks.iter().any(|task| task.title == "nginx"));
    assert!(tree.tasks.iter().any(|task| task.title == "webdesign-scanner"));
    assert!(tree.tasks.iter().any(|task| task.details.contains("## Acceptance")));
    let output = render(&tree.tasks, &tree.preamble).unwrap();
    let again = parse(&output, &HashMap::new()).unwrap();
    assert_eq!(tree.tasks, again.tasks);
    assert_eq!(tree.preamble, again.preamble);
}

#[test]
fn f3_titles_starting_with_date_like_text_keep_the_title_and_optional_due_date(){
    for title in ["20261101 Campaign","20260230 Reference","20261101 - Campaign"]{
        for due in [None,Some("2026-12-01".to_string())]{
            let mut task=todo::model::Task::default();task.title=title.into();task.description="Keep the title separate from the date".into();task.due_date=due;
            let output=render(&[task.clone()],"# Tasks").unwrap();let parsed=parse(&output,&HashMap::from([(task.reference.clone(),task.clone())])).unwrap();
            assert_eq!(parsed.tasks[0].title,task.title);assert_eq!(parsed.tasks[0].due_date,task.due_date);
        }
    }
}

#[test]
fn f3_entries_without_identifiers_keep_identity_between_preview_and_reimport(){
    let source="- ⬜H1 Parent - Work\n  - ⬜M1 Same - First\n  - ⬜M1 Same - Second\n- ⬜L1 Other - Third";
    let first=parse(source,&HashMap::new()).unwrap();
    let preview_again=parse(source,&HashMap::new()).unwrap();
    assert_eq!(first.tasks,preview_again.tasks);
    let existing=first.tasks.iter().map(|task|(task.reference.clone(),task.clone())).collect::<HashMap<_,_>>();
    let again=parse(source,&existing).unwrap();assert_eq!(first.tasks,again.tasks);
    assert_eq!(first.tasks.iter().map(|task|&task.id).collect::<std::collections::HashSet<_>>().len(),4);
    let edited=parse(&source.replace("Same - First","Same - Updated"),&existing).unwrap();
    assert_eq!(first.tasks.iter().map(|task|&task.id).collect::<Vec<_>>(),edited.tasks.iter().map(|task|&task.id).collect::<Vec<_>>());
    assert_eq!(edited.tasks[1].description,"Updated");
}

#[test]
fn f3_owners_details_nested_lists_and_code_round_trip() {
    let source = "# Task Tree\n\n- ⏳H5 20261115 Dashboard - Improve Navigation [alice,bob] #dashboard ^\n  - ⬜M2 Links - Add Links #links\n\n# dashboard Dashboard\n\n## Goal\n\nKeep **all** details.\n\n- A detail list\n\n```markdown\n# example Example\n- ⬜H2 Fake - This Is Code #fake\n```\n";
    let tree = parse(source, &HashMap::new()).unwrap();
    assert_eq!(tree.tasks.len(), 2);
    assert_eq!(tree.tasks[0].owners, vec!["alice", "bob"]);
    assert_eq!(tree.tasks[1].parent_id.as_deref(), Some(tree.tasks[0].id.as_str()));
    assert!(tree.tasks[0].details.contains("# example"));
    let text = render(&tree.tasks, &tree.preamble).unwrap();
    let again = parse(&text, &HashMap::new()).unwrap();
    assert_eq!(tree.tasks, again.tasks);
    assert_eq!(tree.preamble, again.preamble);
}

#[test]
fn f3_invalid_dates_duplicates_and_indentation_are_rejected() {
    for source in ["- ⬜H1 20260230 A - B #a", "- ⬜H1 A - B #a\n- ⬜H1 B - C #a", "- ⬜H1 A - B\n    - ⬜H1 B - C", "- ⬜H1 A - B #a\n\n# missing Missing\nDetails"] {
        assert!(parse(source, &HashMap::new()).is_err(), "{source}");
    }
}

#[test]
fn f3_literal_brackets_and_title_separators_round_trip() {
    let mut task=todo::model::Task::default();
    task.title="Research - Delivery [draft]".into();task.description="Keep [literal] brackets and \\ paths".into();
    let output=render(&[task.clone()],"# Tasks").unwrap();
    let result=parse(&output,&HashMap::from([(task.reference.clone(),task.clone())])).unwrap();
    assert_eq!(result.tasks[0].title,task.title);assert_eq!(result.tasks[0].description,task.description);assert!(result.tasks[0].owners.is_empty());
}

#[test]
fn f3_archived_subtrees_export_without_orphan_detail_chapters() {
    let mut tree=parse("- ⬜H1 Parent - Work #parent\n  - ⬜M1 Child - Work #child\n- ⬜L1 Visible - Work #visible\n\n# child Child\n\n## Details\n\nRetained in JSON.", &HashMap::new()).unwrap();
    tree.tasks[0].archived=true;
    let output=render(&tree.tasks,&tree.preamble).unwrap();
    let parsed=parse(&output,&HashMap::new()).unwrap();
    assert_eq!(parsed.tasks.len(),1);assert_eq!(parsed.tasks[0].reference,"visible");assert!(!output.contains("#child"));assert!(!output.contains("# child"));
}

#[test]
fn f3_detail_indentation_html_and_hard_breaks_round_trip(){
    let source="```markdown\n- ⬜H1 Example - Not A Task #example\n```\n\n- ⬜H1 First - Work #first\n- ⬜M2 Second - Work #second\n\n# first First\n\n    let value = 1;\n    # An indented code example\n\nParagraph  \nnext line\n\n<pre>\n# second This Is Literal HTML Content\n</pre>\n\n# second Second\n\n## Actual Details\n\nKeep the second task separate.";
    let tree=parse(source,&HashMap::new()).unwrap();assert_eq!(tree.tasks.len(),2);
    assert!(tree.tasks[0].details.starts_with("    let value"));assert!(tree.tasks[0].details.contains("Paragraph  \nnext line"));assert!(tree.tasks[0].details.contains("# second This Is Literal HTML Content"));assert!(tree.tasks[1].details.contains("Actual Details"));
    let output=render(&tree.tasks,&tree.preamble).unwrap();let again=parse(&output,&HashMap::new()).unwrap();assert_eq!(tree.tasks,again.tasks);
}

#[test]
fn f3_markdown_export_refuses_a_detail_block_that_would_consume_the_next_chapter(){
    let mut tasks=parse("- ⬜H1 First - Work #first\n- ⬜M1 Second - Work #second",&HashMap::new()).unwrap().tasks;
    tasks[0].details="```rust\nUnfinished example".into();tasks[1].details="## Separate details\n\nPreserve this text.".into();
    assert!(render(&tasks,"").is_err());
    tasks[0].details.push_str("\n```");assert!(render(&tasks,"").is_ok());
}

#[test]
fn f7_details_use_level_two_headings_and_preserve_fenced_examples(){
    for details in ["# First level","   # Indented heading","First level\n===","> # Quoted heading","- # List heading","#hashtag\n==="] {
        assert!(todo::markdown::validate_details(details).is_err(),"{details}");
    }
    for details in ["## Second level","    # An indented code example","````markdown\n# Example\n```\n# Still code\n````\n\n## Actual heading","~~~\n```\n# Example\n~~~","<pre>\n# Code example\n</pre>","#\u{00a0}Literal text"] {
        assert!(todo::markdown::validate_details(details).is_ok(),"{details}");
    }
}
