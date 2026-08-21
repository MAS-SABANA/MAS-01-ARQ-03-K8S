# Arquitectura General

Vista de alto nivel: actores, sistemas externos y clúster Kubernetes.

```mermaid
graph TB
  DEV(["👨‍💻 Developer"])

  subgraph GH["GitHub"]
    direction LR
    REPO["📁 Repositorio Git\ncódigo · Helm charts · manifiestos ArgoCD"]
    GA["⚙️ GitHub Actions\nPipeline CI/CD"]
  end

  REG[("🐳 Docker Hub\nRegistro de imágenes")]

  subgraph K8S["Kubernetes Cluster"]
    direction TB
    subgraph NS_ARGO["namespace: argocd"]
      ARGO["🔄 ArgoCD\napplication-controller"]
    end
    subgraph NS_MS["namespace: microservice"]
      HELM["📦 Helm Release\nmicroservice-demo"]
      MS["🚀 Pod × 2\nExpress + TypeScript :8080"]
      SVC["🔀 Service ClusterIP\n:80 → :8080"]
      HPA["📈 HPA\n(solo prod, 2–10 réplicas)"]
    end
  end

  DEV          -->|"git push main"| REPO
  REPO         -->|"dispara workflow"| GA
  GA           -->|"① docker build & push"| REG
  GA           -->|"② argocd app set image.tag"| ARGO
  ARGO         -->|"observa rama main"| REPO
  ARGO         -->|"helm upgrade si hay drift"| HELM
  HELM         -->|"genera recursos"| SVC
  HELM         -->|"genera recursos"| HPA
  HELM         -->|"genera recursos"| MS
  SVC          -->|"balancea tráfico"| MS
  HPA          -->|"ajusta réplicas"| MS
  MS           -->|"pull imagen"| REG
```

---

# Contenedores K8s – Vista interna del clúster

Detalle de cada objeto Kubernetes generado por el Helm chart.

```mermaid
graph LR
  subgraph EXT["Externos"]
    GIT[("📁 GitHub\nrama main")]
    DH[("🐳 Docker Hub\nimagen :SHA")]
  end

  subgraph NS_ARGO["namespace: argocd"]
    direction TB
    SRV["argocd-server\nUI + API"]
    REPO_SRV["argocd-repo-server\nclona y renderiza charts"]
    CTRL["application-controller\nreconcilia estado"]
    SRV --- REPO_SRV --- CTRL
  end

  subgraph NS_MS["namespace: microservice"]
    direction TB
    DEPLOY["Deployment\nreplicas: 2"]
    POD1["Pod 1\nnode:20-alpine"]
    POD2["Pod 2\nnode:20-alpine"]
    SVC["Service\nClusterIP :80→:8080"]
    ING["Ingress\nnginx (solo prod)"]
    HPA2["HPA\nmin:2 max:10"]

    DEPLOY -->|"controla"| POD1
    DEPLOY -->|"controla"| POD2
    SVC    -->|"→ :8080"| POD1
    SVC    -->|"→ :8080"| POD2
    ING    -->|"→ :80"| SVC
    HPA2   -->|"escala"| DEPLOY
  end

  CTRL      -->|"observa"| GIT
  REPO_SRV  -->|"clona chart"| GIT
  CTRL      -->|"kubectl apply\n(helm upgrade)"| DEPLOY
  POD1      -->|"pull imagen"| DH
  POD2      -->|"pull imagen"| DH
```
