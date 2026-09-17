import sys

from loguru import logger

logger.remove()
logger.add(
    sys.stderr, level="INFO", format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {name}:{function}:{line} - {message}"
)
logger.add("logs/app.log", rotation="10 MB", retention="7 days", level="DEBUG")
