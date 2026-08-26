# Local vs Nube – por qué migrar ArgoCD

El job `deploy` de GitHub Actions corre en un runner **en la nube de GitHub**, no en tu computador. No puede alcanzar un ArgoCD que solo vive en minikube (`localhost`); sí puede alcanzar uno con IP pública en DigitalOcean.

```mermaid
graph TB
  subgraph LOCAL["💻 Tu laptop"]
    MK["Minikube\nargocd-server\nsolo accesible en localhost:8080"]
  end

  subgraph GH_CLOUD["☁️ GitHub"]
    GA["⚙️ GitHub Actions\nrunner efímero en la nube"]
  end

  GA -.->|"❌ localhost:8080\ninalcanzable desde internet"| MK

  subgraph DO["🌊 DigitalOcean"]
    LB["⚖️ Load Balancer\nIP pública"]
    ARGO2["🔄 ArgoCD\nargocd-server"]
    LB --> ARGO2
  end

  GA -->|"✅ IP pública : 443\nalcanzable desde internet"| LB
```

---

# Infraestructura DOKS – detalle

Cómo queda ArgoCD y el microservicio una vez migrados a DigitalOcean Kubernetes (ver [`docs/despliegue-digitalocean.md`](../docs/despliegue-digitalocean.md)).

```mermaid
graph TB
  USER(["🌐 Internet\n(incluye GitHub Actions)"])
  GH[("📁 GitHub\nrepo + imágenes en Docker Hub")]

  subgraph DO["DigitalOcean"]
    LB["⚖️ Load Balancer\nIP pública · :443 → argocd-server"]

    subgraph DOKS["Clúster DOKS"]
      subgraph CP["Control Plane\n(gestionado por DO, sin costo)"]
        API["kube-apiserver"]
      end

      subgraph POOL["Node Pool · 1 nodo (s-2vcpu-2gb)"]
        subgraph NS_ARGO["namespace: argocd"]
          ARGOSRV["argocd-server"]
          ARGOCTRL["application-controller"]
          ARGOREPO["repo-server"]
        end
        subgraph NS_MS["namespace: microservice"]
          POD1["Pod microservicio"]
          POD2["Pod microservicio"]
        end
      end
    end
  end

  USER        -->|"HTTPS"| LB
  LB          --> ARGOSRV
  ARGOCTRL    -->|"reconcilia"| API
  ARGOREPO    -->|"clona helm/microservice-chart"| GH
  ARGOCTRL    -->|"helm upgrade"| POD1
  ARGOCTRL    -->|"helm upgrade"| POD2
```

---

# Secuencia completa – GitHub Actions → DigitalOcean

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant GA as GitHub Actions
  participant DH as Docker Hub
  participant LB as DO Load Balancer\n(IP pública)
  participant AC as ArgoCD (en DOKS)
  participant K8s as DOKS (microservice)

  Dev->>GA: git push main
  GA->>DH: docker build & push :SHA
  GA->>LB: argocd login ARGOCD_SERVER
  LB->>AC: enruta a argocd-server
  GA->>AC: argocd app set image.tag=SHA
  GA->>AC: argocd app sync
  AC->>K8s: helm upgrade microservice-demo
  K8s->>DH: pull imagen :SHA
  K8s-->>AC: Deployment Available
  AC-->>GA: App synced & healthy
```
