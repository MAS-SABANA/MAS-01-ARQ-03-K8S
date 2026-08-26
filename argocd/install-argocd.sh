#!/usr/bin/env bash
# Script para instalar ArgoCD en el clúster Kubernetes
set -e

echo "==> Creando namespace argocd..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

echo "==> Instalando ArgoCD (versión estable)..."
# --server-side evita el límite de 256KB en la anotación last-applied-configuration
# que kubectl apply normal excede con el CRD applicationsets.argoproj.io
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "==> Esperando que los pods estén listos..."
kubectl wait --for=condition=available --timeout=120s deployment/argocd-server -n argocd

echo "==> Obteniendo contraseña inicial del admin..."
kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d && echo

echo ""
echo "==> ArgoCD listo. Accede vía:"
echo "    kubectl port-forward svc/argocd-server -n argocd 8080:443"
echo "    URL: https://localhost:8080  |  usuario: admin"
