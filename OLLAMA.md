# Running with Ollama (open-source models)

This guide explains how to run the tool with Ollama instead of OpenAI, using
`podman-compose` and containerized services.

## Prerequisites

- [Podman](https://podman.io/getting-started/installation) installed
- [podman-compose](https://github.com/containers/podman-compose) installed
  (`pip install podman-compose`)
- Git (to clone the repo)
- ~6 GB of free disk space for model downloads

## Quick start

### 1. Create the environment file

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with the following content:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434/v1
DEFAULT_MODEL=qwen2.5:3b
EMBEDDING_MODEL=nomic-embed-text

SESSION_SECRET=some-secret-value
COOKIE_NAME=SpyLogicLocal.sid
SESSION_EXPIRY_HOURS=8
```

### 2. Start all services

```bash
podman-compose --profile ollama up --build -d
```

### 3. Wait for initialization

On the first run, Ollama needs to download the models (~2 GB for `qwen2.5:3b`,
~300 MB for `nomic-embed-text`). The `spylogic` backend retries connecting to
Ollama every 15 seconds for up to 15 minutes, so it will start serving once
the models are ready.

Monitor progress (see [Viewing logs](#viewing-logs) below) and wait until you
see:

```
Server is running on port 5000 (provider: ollama)
```

### 4. Open the application

Go to [http://localhost:5000](http://localhost:5000) in your browser.

### Subsequent runs

After the first run, models are cached in the `ollama_data` volume. Startup
is much faster — typically under 30 seconds.

```bash
podman-compose --profile ollama up -d
```

## Architecture

The Ollama profile starts **3 containers**:

| Container | Service | Purpose | Expected state |
|---|---|---|---|
| `prompt-injection_ollama_1` | `ollama` | Ollama model server | **Running** (stays up) |
| `prompt-injection_ollama-pull_1` | `ollama-pull` | Downloads models on startup | **Exited (0)** after completion |
| `prompt-injection_spylogic_1` | `spylogic` | Application (backend + frontend) | **Running** (stays up) |

After successful startup:

- `podman ps` should show **2 running** containers (`ollama` and `spylogic`)
- `podman ps -a` should show **3 total** (the above + `ollama-pull` with exit code 0)

## Viewing logs

`podman-compose logs` may not work due to a known log driver issue. Use
`podman logs` directly instead:

```bash
# Application logs
podman logs -f prompt-injection_spylogic_1

# Ollama server logs
podman logs -f prompt-injection_ollama_1

# Model pull progress
podman logs -f prompt-injection_ollama-pull_1
```

## Stopping and restarting

```bash
# Stop all services
podman-compose --profile ollama down

# Stop and remove downloaded models (full reset)
podman-compose --profile ollama down -v
```

If `podman-compose down` fails to remove containers:

```bash
podman rm -f -a
```

## Clean rebuild from scratch

```bash
podman rm -f -a
podman volume rm -f prompt-injection_ollama_data
podman-compose --profile ollama up --build -d
```

## Full cleanup (shared machines)

When you're done using the tool on a shared computer, run the following to
remove **all** containers, images, volumes, and networks created by this
project. This frees all disk space (including downloaded models).

### Step-by-step cleanup

```bash
# 1. Stop and remove all project containers
podman-compose --profile ollama down -v
```

If the above fails (common with podman-compose), do it manually:

```bash
# 2. Force-remove all containers
podman rm -f -a

# 3. Remove the model data volume
podman volume rm -f prompt-injection_ollama_data

# 4. Remove project images
podman rmi docker.io/ollama/ollama:latest
podman rmi docker.io/scottlogic/spylogic-playground

# 5. Remove the build base image
podman rmi docker.io/node:lts-alpine

# 6. Remove the project network
podman network rm prompt-injection_spylogic-net 2>/dev/null; true
```

### One-liner (nuclear option)

If this is a dedicated machine and no other Podman workloads exist, you can
wipe everything at once:

```bash
podman rm -f -a && podman rmi -a -f && podman volume rm -a -f && podman network prune -f
```

> **Warning**: This removes *all* Podman containers, images, volumes, and
> unused networks on the machine — not just those from this project.

### Verify cleanup

```bash
podman ps -a          # should show no containers
podman images         # should show no project images
podman volume ls      # should show no volumes
podman network ls     # should only show the default "podman" network
```

## Troubleshooting

### Container name already in use

```
Error: the container name "prompt-injection_ollama_1" is already in use
```

Force-remove all containers and retry:

```bash
podman rm -f -a
podman-compose --profile ollama up --build -d
```

### Port already in use

```
Error: cannot listen on the TCP port: listen tcp4 :11434: bind: address already in use
```

Something else is using port 11434 (possibly a native Ollama installation).
Find and stop it:

```bash
# Linux
sudo ss -tlnp | grep 11434
kill <PID>

# Windows (PowerShell)
netstat -aon | findstr :11434
taskkill /F /PID <PID>
```

### ENOTFOUND ollama (DNS resolution failure)

```
FetchError: request to http://ollama:11434/v1/models failed, reason: getaddrinfo ENOTFOUND ollama
```

The containers are not on a shared network. The `compose.yaml` defines a
`spylogic-net` network for this purpose. Make sure you haven't modified the
`networks` section. If the issue persists, recreate everything:

```bash
podman rm -f -a
podman network rm prompt-injection_spylogic-net 2>/dev/null; true
podman-compose --profile ollama up --build -d
```

### No models found / model not found

```
Error: No models found from Ollama
```

The models haven't been pulled yet. The backend retries automatically for up
to 15 minutes. If it still fails, pull models manually:

```bash
podman exec prompt-injection_ollama_1 ollama pull qwen2.5:3b
podman exec prompt-injection_ollama_1 ollama pull nomic-embed-text
podman restart prompt-injection_spylogic_1
```

### Model requires more memory than available

```
Error: 500 model requires more system memory (4.8 GiB) than is available (2.2 GiB)
```

The model is too large for the available memory. Options:

- **Use a smaller model**: `qwen2.5:3b` (~2 GB) or `llama3.2` (~2 GB) instead
  of `llama3.1` (~5 GB). Update `DEFAULT_MODEL` in `backend/.env` and the
  `ollama pull` command in `compose.yaml`.
- **Increase Podman VM memory** (Windows/macOS only):
  ```bash
  podman machine stop
  podman machine set --memory 8192
  podman machine start
  ```

### Image name resolution errors (Linux)

```
Error: short-name "ollama/ollama:latest" did not resolve to an alias
```

Podman on Linux requires fully qualified image names. The `compose.yaml`
already uses `docker.io/` prefixed names. If you see this error, make sure
you have the latest version of `compose.yaml`.

### Raw JSON in chat responses

If the bot responds with raw JSON like
`{"name": "getCompanyInfo", "parameters": {...}}` instead of natural language,
the model doesn't handle tool calling properly. Switch to a model with better
tool calling support:

- `qwen2.5:3b` — recommended, good tool calling at small size
- `qwen2.5:7b` — better quality, needs ~5 GB RAM
- `mistral` — good alternative, needs ~4 GB RAM

## NVIDIA GPU acceleration

GPU acceleration significantly speeds up inference. Setup is only needed once
per machine.

### Linux setup

1. Ensure NVIDIA drivers are installed (`nvidia-smi` should show your GPU).

2. Install nvidia-container-toolkit:

   ```bash
   # Fedora/RHEL/CentOS
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
     | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
   sudo dnf install -y nvidia-container-toolkit

   # Ubuntu/Debian
   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
     | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
     | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
     | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   sudo apt update && sudo apt install -y nvidia-container-toolkit
   ```

3. Generate CDI specification:

   ```bash
   sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
   nvidia-ctk cdi list
   ```

   You should see `nvidia.com/gpu=all` in the output.

4. Verify GPU access from a container:

   ```bash
   podman run --rm --device nvidia.com/gpu=all docker.io/ollama/ollama:latest nvidia-smi
   ```

5. Uncomment the `devices` line in `compose.yaml` under the `ollama` service:

   ```yaml
   devices:
     - nvidia.com/gpu=all
   ```

### Windows setup (Podman Machine with WSL2)

1. Ensure NVIDIA GPU drivers with WSL2 support are installed.

2. Enter the Podman machine and install the toolkit:

   ```powershell
   podman machine ssh
   ```

   Inside the machine:

   ```bash
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
     | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
   sudo dnf install -y nvidia-container-toolkit
   sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
   nvidia-ctk cdi list
   exit
   ```

3. Uncomment the `devices` line in `compose.yaml` as described above.

### GPU memory requirements

| Model | Parameters | VRAM needed | Min GPU |
|---|---|---|---|
| `qwen2.5:3b` | 3B | ~2 GB | GTX 1650 (4 GB) |
| `llama3.2` | 3B | ~2 GB | GTX 1650 (4 GB) |
| `qwen2.5:7b` | 7B | ~5 GB | RTX 3060 (6 GB) |
| `llama3.1` | 8B | ~5 GB | RTX 3060 (6 GB) |
| `nomic-embed-text` | — | ~300 MB | Any |

### If podman-compose doesn't support the `devices` key

Run the Ollama container manually with GPU, then start the rest normally:

```bash
podman network create spylogic-net 2>/dev/null; true

podman run -d --name prompt-injection_ollama_1 \
  --network spylogic-net \
  --device nvidia.com/gpu=all \
  -v ollama_data:/root/.ollama \
  -p 11434:11434 \
  docker.io/ollama/ollama:latest

podman-compose --profile ollama up --build -d
```

## Choosing a model

Edit two places when changing models:

1. `backend/.env` — set `DEFAULT_MODEL` to the model name
2. `compose.yaml` — update the `ollama pull` command in the `ollama-pull` service

Models must support tool/function calling for full functionality (email
sending, document queries). Recommended models:

| Model | Size | Tool calling | Notes |
|---|---|---|---|
| `qwen2.5:3b` | 2 GB | Good | Best balance of size and capability |
| `qwen2.5:7b` | 5 GB | Very good | Better quality, needs more RAM/VRAM |
| `llama3.2` | 2 GB | Limited | May output raw JSON instead of using tools |
| `mistral` | 4 GB | Good | Solid alternative |
