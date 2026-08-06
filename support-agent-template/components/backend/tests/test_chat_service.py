from models.chat import Reference
from services.chat_service import ChatService


def test_parse_response_extracts_references() -> None:
    answer, references = ChatService._parse_response(
        "Use the documented procedure.\n\n"
        "**References**\n"
        "- [Support guide](https://example.test/support)\n"
    )

    assert answer == "Use the documented procedure."
    assert references == [
        Reference(title="Support guide", link="https://example.test/support")
    ]


def test_parse_response_removes_foundry_citation_tokens() -> None:
    answer, references = ChatService._parse_response(
        "The service is available. citeturn0search0"
    )

    assert answer == "The service is available."
    assert references == []


def test_parse_response_extracts_inline_web_search_citations() -> None:
    answer, references = ChatService._parse_response(
        "See the [current documentation](https://example.test/current)."
    )

    assert answer == "See the [current documentation](https://example.test/current)."
    assert references == [
        Reference(
            title="current documentation",
            link="https://example.test/current",
        )
    ]


def test_extract_url_citations_from_foundry_response() -> None:
    annotation = type(
        "Annotation",
        (),
        {
            "type": "url_citation",
            "title": "Public documentation",
            "url": "https://example.test/docs",
        },
    )()
    content = type("Content", (), {"annotations": [annotation]})()
    item = type("Item", (), {"content": [content]})()
    response = type("Response", (), {"output": [item]})()

    assert ChatService._extract_url_citations(response) == [
        Reference(
            title="Public documentation",
            link="https://example.test/docs",
        )
    ]


def test_merge_references_deduplicates_links() -> None:
    reference = Reference(title="Docs", link="https://example.test/docs")

    assert ChatService._merge_references([reference], [reference]) == [reference]
