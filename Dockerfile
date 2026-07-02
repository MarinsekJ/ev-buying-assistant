FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PROJECT_ROOT=/workspace
ENV PYTHONPATH=/workspace/src
ENV MODEL_DIR=/workspace/models
ENV PYTHON_BIN=/opt/venv/bin/python
ENV MPLBACKEND=Agg
ENV PYTHONUNBUFFERED=1
ENV PATH=/opt/venv/bin:$PATH

WORKDIR /workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && python3 -m venv /opt/venv \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-render.txt pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements-render.txt \
    && pip install --no-cache-dir -e .

COPY package.json ./
COPY app/backend/package.json app/backend/package-lock.json ./app/backend/
RUN npm ci --prefix app/backend --omit=dev

COPY app/backend ./app/backend
COPY data ./data
COPY models ./models
COPY reports ./reports

RUN python -m ev_transition.train

EXPOSE 10000
CMD ["node", "app/backend/server.js"]
