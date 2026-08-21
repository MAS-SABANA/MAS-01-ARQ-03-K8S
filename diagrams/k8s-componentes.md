# Componentes Kubernetes – Helm Chart

Todos los objetos que crea `helm install microservice-demo` y sus relaciones.

```mermaid
graph TB
  USER(["🌐 Cliente HTTP"])

  subgraph NS_MS["namespace: microservice"]
    direction TB
    ING["Ingress\nnginx · solo prod"]
    SVC["Service\nClusterIP :80 → :8080"]
    HPA["HPA\nautoscaling/v2\nmin:2 max:10"]
    DEPLOY["Deployment\nreplicas: 2"]
    POD1["Pod 1\nnode:20-alpine · :8080\n/health · / · /items"]
    POD2["Pod 2\nnode:20-alpine · :8080\n/health · / · /items"]
  end

  REG[("🐳 Docker Hub\nimagen :SHA")]
  ARGO["🔄 ArgoCD"]

  USER   -->|"HTTP :80"| ING
  ING    -->|"→ :80"| SVC
  SVC    -->|"balancea"| POD1
  SVC    -->|"balancea"| POD2
  HPA    -->|"ajusta replicas"| DEPLOY
  DEPLOY -->|"crea"| POD1
  DEPLOY -->|"crea"| POD2
  POD1   -->|"pull"| REG
  POD2   -->|"pull"| REG
  ARGO   -->|"helm upgrade"| DEPLOY
```

---

# Ciclo de vida de un Pod

Estados por los que pasa un Pod desde su creación hasta su eliminación.

```mermaid
stateDiagram-v2
  [*]          --> Pending    : helm upgrade / kubectl apply

  Pending      --> Running    : nodo asignado\nimagen descargada\ncontenedor iniciado

  Running      --> Ready      : readinessProbe /health → 200 OK
  Ready        --> Running    : readinessProbe falla\n(tráfico retirado temporalmente)

  Running      --> Unhealthy  : livenessProbe /health falla 3 veces
  Unhealthy    --> Terminated : K8s termina el contenedor

  Terminated   --> Pending    : ReplicaSet crea reemplazo automático

  Ready        --> Terminating: rolling update\no scale down
  Terminating  --> [*]        : graceful shutdown (SIGTERM + 30s)
```

---

# Infraestructura de Despliegue

Distribución de los componentes entre nodos del clúster.

```mermaid
graph LR
  DEV(["👨‍💻 Developer"])
  GH["📁 GitHub\nrama main"]
  GA["⚙️ GitHub Actions"]
  DH[("🐳 Docker Hub")]

  DEV -->|"git push"| GH
  GH  -->|"trigger"| GA
  GA  -->|"docker push :SHA"| DH

  subgraph CLUSTER["Kubernetes Cluster"]
    subgraph CP["Control Plane"]
      API["kube-apiserver"]
      SCHED["kube-scheduler"]
      CTRL_MGR["kube-controller-manager"]
      ETCD[("etcd")]
      API --- SCHED
      API --- CTRL_MGR
      API --- ETCD
    end

    subgraph W1["Worker Node 1"]
      direction TB
      KL1["kubelet"]
      PA["Pod: microservice-1\n:8080"]
      ARGO_POD["Pod: argocd-server"]
      KL1 --> PA
      KL1 --> ARGO_POD
    end

    subgraph W2["Worker Node 2"]
      direction TB
      KL2["kubelet"]
      PB["Pod: microservice-2\n:8080"]
      ARGO_REPO["Pod: argocd-repo-server"]
      KL2 --> PB
      KL2 --> ARGO_REPO
    end

    CP -->|"schedule Pods"| W1
    CP -->|"schedule Pods"| W2
  end

  GA         -->|"argocd app sync"| ARGO_POD
  ARGO_POD   -->|"kubectl apply"| API
  ARGO_REPO  -->|"clona chart"| GH
  PA         -->|"pull imagen"| DH
  PB         -->|"pull imagen"| DH
```
