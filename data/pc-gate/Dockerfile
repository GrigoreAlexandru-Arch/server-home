FROM python@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client openssh-sftp-server && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py entrypoint.sh init_keys.sh ./
RUN chmod +x entrypoint.sh init_keys.sh
EXPOSE 8123
ENTRYPOINT ["/app/entrypoint.sh"]