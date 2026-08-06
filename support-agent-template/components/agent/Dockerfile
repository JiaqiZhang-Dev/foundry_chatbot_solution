FROM mcr.microsoft.com/azurelinux/base/python:3.12

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV ENABLE_INSTRUMENTATION=true
ENV OTEL_EXPERIMENTAL_RESOURCE_DETECTORS=otel

COPY requirements.txt .
RUN pip install --no-cache-dir --pre -r requirements.txt

COPY config/ ./config/
COPY utils/ ./utils/
COPY agent.yaml instruction.md init.py ./

EXPOSE 8088

CMD ["python3", "-u", "init.py"]
