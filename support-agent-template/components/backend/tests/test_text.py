from utils.text import preprocess_message


def test_preprocess_message_preserves_links_and_removes_teams_markup() -> None:
    message = '<at>Support Agent</at> See <a href="https://example.test">the guide</a>.'

    assert (
        preprocess_message(message)
        == "Support Agent See [the guide](https://example.test)."
    )
