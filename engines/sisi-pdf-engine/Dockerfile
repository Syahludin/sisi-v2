FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home --uid 10001 engine && chown -R engine /app
USER engine
# 1 worker + 4 thread: cukup untuk BA ULP (max-instances 1). Timeout 120 s = batas UrlFetchApp Apps Script.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 4 --timeout 120 app:app
