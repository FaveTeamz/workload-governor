{{/*
Expand the name of the chart.
*/}}
{{- define "workload-governor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited.
*/}}
{{- define "workload-governor.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label (chart name + version, safe for label values).
*/}}
{{- define "workload-governor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "workload-governor.labels" -}}
helm.sh/chart: {{ include "workload-governor.chart" . }}
{{ include "workload-governor.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels used by Deployments and Services.
*/}}
{{- define "workload-governor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "workload-governor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Resolved service account name.
*/}}
{{- define "workload-governor.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "workload-governor.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Resolved image tag (falls back to chart appVersion).
*/}}
{{- define "workload-governor.imageTag" -}}
{{- .Values.image.tag | default .Chart.AppVersion }}
{{- end }}
