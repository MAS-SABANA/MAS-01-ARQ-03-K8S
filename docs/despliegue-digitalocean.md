# Desplegar ArgoCD en un clúster real (DigitalOcean Kubernetes)

> Objetivo: mover ArgoCD de minikube (local, sin IP pública) a un clúster de Kubernetes gestionado en DigitalOcean (**DOKS**), que sí tiene una IP pública alcanzable desde internet — así el job `deploy` de [.github/workflows/ci-cd.yaml](../.github/workflows/ci-cd.yaml) puede conectarse de verdad, tal como ocurriría en un entorno productivo.
>
> Diagramas de esta arquitectura (local vs nube, infraestructura DOKS, secuencia completa): [`diagrams/despliegue-digitalocean.md`](../diagrams/despliegue-digitalocean.md)

## Por qué esto resuelve el problema

Con minikube, `ARGOCD_SERVER` solo podía ser `localhost` — inalcanzable desde los runners de GitHub Actions (máquinas en la nube de GitHub). Con DOKS, el clúster completo vive en la nube de DigitalOcean con una IP pública real: `ARGOCD_SERVER` pasa a ser esa IP, y GitHub Actions se conecta a ella igual que se conectaría cualquier cliente desde internet.

```mermaid
graph LR
  GA["⚙️ GitHub Actions\n(runner en la nube)"]
  DO["🌊 DigitalOcean\nClúster DOKS"]
  ARGO["🔄 ArgoCD\nargocd-server :443\nIP pública"]

  GA -->|"argocd login IP_PUBLICA"| ARGO
  ARGO -->|"vive dentro de"| DO
```

## 0. Costos (revisar antes de crear cualquier recurso)

DigitalOcean **no cobra por el control plane** de Kubernetes (a diferencia de AWS EKS), solo por los recursos que se utilicen:

| Recurso | Costo aproximado |
|---|---|
| 1 nodo worker (`s-2vcpu-2gb`) | ~$18 USD/mes → prorrateado por hora (~$0.025/h) |
| Load Balancer (para exponer ArgoCD) | ~$12 USD/mes → prorrateado por hora (~$0.017/h) |

Con los créditos gratuitos este costo es prácticamente nulo si el clúster se usa solo durante el ejercicio, **pero es necesario borrar el clúster y el Load Balancer al finalizar** (Sección 10) para no seguir consumiendo créditos día tras día. Se recomienda verificar los precios actuales en el [pricing de DigitalOcean](https://www.digitalocean.com/pricing/kubernetes), ya que pueden cambiar.

---

## 1. Crear cuenta y reclamar créditos

1. Crear una cuenta en [digitalocean.com](https://www.digitalocean.com/) (o iniciar sesión si ya existe una).
2. Aplicar la promoción o créditos correspondientes (por ejemplo, el [GitHub Student Developer Pack](https://education.github.com/pack) incluye créditos de DigitalOcean).
3. DigitalOcean solicita un método de pago aunque se disponga de créditos — es un comportamiento normal de la plataforma; el cobro solo se activa si los créditos se agotan.

## 2. Instalar y autenticar `doctl` (CLI de DigitalOcean)

```bash
brew install doctl
```

Generar un **Personal Access Token**: dashboard de DigitalOcean → **API** → **Generate New Token** (con permisos de lectura/escritura), y luego:

```bash
doctl auth init
# pegar el token cuando se solicite
```

## 3. Crear el clúster DOKS

```bash
doctl kubernetes cluster create microservice-demo \
  --region nyc1 \
  --node-pool "name=pool1;size=s-2vcpu-2gb;count=1" \
  --wait
```

- `--region nyc1` → puede sustituirse por la región más cercana (`doctl kubernetes options regions` para ver todas las disponibles).
- `count=1` → un solo nodo es suficiente para este ejercicio.
- Al finalizar, `doctl` **configura automáticamente el `kubectl` local** con un nuevo contexto apuntando al clúster remoto.

Verificar que `kubectl` está apuntando al clúster de DigitalOcean y no a minikube:

```bash
kubectl config current-context
# doctl-nyc1-microservice-demo

kubectl get nodes
# debería mostrar 1 nodo con un nombre tipo pool1-xxxxx
```

> El contexto de minikube **no desaparece**, queda disponible como otro contexto más. Para volver a él posteriormente: `kubectl config get-contexts` y luego `kubectl config use-context minikube`.

## 4. Instalar ArgoCD en el clúster remoto

Es el mismo script utilizado en el entorno local — como `kubectl` ahora apunta a DOKS, la instalación queda ahí:

```bash
./argocd/install-argocd.sh
```

## 5. Exponer `argocd-server` con una IP pública real

Por defecto el `Service` de ArgoCD es `ClusterIP` (accesible solo dentro del clúster, igual que en minikube). En DOKS se cambia a `LoadBalancer`, y DigitalOcean crea automáticamente un balanceador de carga real con IP pública:

```bash
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
```

Esperar a que DigitalOcean asigne la IP (toma entre 1 y 2 minutos):

```bash
kubectl get svc argocd-server -n argocd --watch
# EXTERNAL-IP pasa de <pending> a una IP real, ej: 143.198.xxx.xxx
# Ctrl+C una vez aparezca la IP
```

## 6. Obtener la contraseña del admin (en este clúster nuevo)

```bash
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

> Es una contraseña **distinta** a la generada en minikube — cada instalación de ArgoCD genera la suya propia.

## 7. Probar el login manualmente antes de configurar GitHub

```bash
argocd login <EXTERNAL-IP> --username admin --password <PASSWORD> --insecure
```

`--insecure` sigue siendo necesario en este punto porque ArgoCD usa por defecto un certificado autofirmado (no se ha configurado un dominio con Let's Encrypt) — es habitual en una prueba de concepto, aunque en un entorno productivo real se reemplaza por un `Ingress` con TLS válido.

Agregar el repositorio y aplicar el `Application` (igual que en el Paso 5 del README, pero ahora contra este clúster):

```bash
argocd repo add https://github.com/MAS-SABANA/MAS-01-ARQ-03-K8S.git
kubectl apply -f argocd/application.yaml
argocd app sync microservice-demo
argocd app get microservice-demo
```

## 8. Configurar los secrets en GitHub

**Settings → Secrets and variables → Actions**:

| Secret | Valor |
|---|---|
| `ARGOCD_SERVER` | `<EXTERNAL-IP>` (solo la IP, sin `https://` ni puerto) |
| `ARGOCD_PASSWORD` | la contraseña obtenida en la Sección 6 |

`DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN` ya deberían estar configurados desde el Paso 7 del README — no cambian.

## 9. Probar el pipeline completo

Realizar un cambio pequeño en `microservice/` (por ejemplo, un texto en `/health`) y hacer `git push` a `main`. El job `build` construye y publica la imagen; el job `deploy` ahora sí puede conectarse al `ARGOCD_SERVER` real y ejecutar `argocd app sync` de forma efectiva, desde un runner en la nube de GitHub hacia el clúster en la nube de DigitalOcean.

Verificar el resultado apuntando `curl` a la IP pública del `Service` del microservicio (no al de ArgoCD):

```bash
kubectl get svc -n microservice
```

---

## 10. IMPORTANTE — Borrar todo al finalizar (para no consumir créditos innecesariamente)

```bash
# Elimina el clúster completo (nodos + control plane)
doctl kubernetes cluster delete microservice-demo

# Confirma que el Load Balancer también se haya eliminado
doctl compute load-balancer list
# si queda alguno huérfano, eliminarlo:
doctl compute load-balancer delete <LB-ID>
```

Confirmar en el [panel web de DigitalOcean](https://cloud.digitalocean.com/kubernetes/clusters) → **Kubernetes** y **Networking → Load Balancers** que no queden recursos activos.

---

## Resumen: minikube vs DOKS

| | Minikube (local) | DOKS (DigitalOcean) |
|---|---|---|
| Dónde vive | Máquina local | La nube de DigitalOcean |
| IP pública | No tiene | Sí (vía `LoadBalancer`) |
| GitHub Actions puede conectarse | ❌ No | ✅ Sí |
| Costo | Gratis | ~$0.04 USD/hora mientras esté activo |
| Uso típico | Desarrollo/aprendizaje | Producción / demo real de CI/CD |
