"""Application Insights metrics for the backend."""

from __future__ import annotations

import os

from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry import metrics

_counter = None
_duration = None
_initialized = False


def configure_metrics() -> None:
    global _counter, _duration, _initialized
    if _initialized:
        return
    _initialized = True
    connection_string = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
    if not connection_string:
        return
    configure_azure_monitor(connection_string=connection_string)
    meter = metrics.get_meter("support-agent-backend")
    _counter = meter.create_counter("chat_requests")
    _duration = meter.create_histogram("chat_duration", unit="s")


def record_chat_request() -> None:
    if _counter:
        _counter.add(1)


def record_chat_duration(elapsed: float, *, success: bool) -> None:
    if _duration:
        _duration.record(elapsed, {"success": success})
