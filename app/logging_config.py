# app/logging_config.py
import logging
import sys
from typing import Any, Dict


def setup_logging(config: Dict[str, Any]) -> None:
    """Configure the process-wide logging handlers and default levels."""

    log_config = config.get("logging", {})
    level = log_config.get("level", "INFO").upper()
    format_str = log_config.get(
        "format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Configure root logger
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format=format_str,
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Set specific loggers
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("fastapi").setLevel(logging.INFO)

    # Reduce noise from external libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)

    # Application logger
    app_logger = logging.getLogger("market_insights")
    app_logger.setLevel(getattr(logging, level, logging.INFO))


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(f"market_insights.{name}")
