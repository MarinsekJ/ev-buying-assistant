FROM python:3.11-slim

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt && pip install --no-cache-dir -e .

COPY package.json ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
RUN npm install --prefix app/backend && npm install --prefix app/frontend

COPY . .

ENV PYTHONPATH=/workspace/src
EXPOSE 3000 5173
CMD ["npm", "run", "dev"]

