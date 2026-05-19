from collections.abc import Mapping
from typing import Any

DEFAULT_DASHBOARD_MAX_CONTENT_LENGTH_MB = 512


def resolve_dashboard_max_content_length_mb(
    dashboard_config: Mapping[str, Any] | None,
    default_mb: int = DEFAULT_DASHBOARD_MAX_CONTENT_LENGTH_MB,
) -> int:
    raw_value: Any = default_mb
    if isinstance(dashboard_config, Mapping):
        raw_value = dashboard_config.get("max_content_length_mb", default_mb)
    try:
        resolved_mb = int(raw_value)
    except (TypeError, ValueError):
        resolved_mb = default_mb
    return max(resolved_mb, 1)


def format_plugin_upload_too_large_message(limit_mb: int) -> str:
    return (
        f"插件包过大，当前上传上限为 {limit_mb} MB。"
        "请在 data/cmd_config.json 中调整 dashboard.max_content_length_mb 后重试。"
    )
