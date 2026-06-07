{{- define "chess-tactics.renderMode" -}}
{{- $mode := .Values.renderMode | default "normal" -}}
{{- if not (has $mode (list "normal" "warm" "hot")) -}}
{{- fail (printf "renderMode must be one of: normal, warm, hot; got %q" $mode) -}}
{{- end -}}
{{- $mode -}}
{{- end -}}

{{- define "chess-tactics.isTestEnv" -}}
{{- $mode := include "chess-tactics.renderMode" . -}}
{{- if or (eq $mode "warm") (eq $mode "hot") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "chess-tactics.renderWarm" -}}
{{- $mode := include "chess-tactics.renderMode" . -}}
{{- if or (eq $mode "normal") (eq $mode "warm") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "chess-tactics.renderHot" -}}
{{- $mode := include "chess-tactics.renderMode" . -}}
{{- if or (eq $mode "normal") (eq $mode "hot") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "chess-tactics.resourceName" -}}
{{- if eq (include "chess-tactics.isTestEnv" .) "true" -}}
{{- required "testEnv.slotName is required when renderMode is warm or hot" .Values.testEnv.slotName -}}
{{- else -}}
{{- .Values.name | default "chess-tactics" -}}
{{- end -}}
{{- end -}}

{{- define "chess-tactics.namespace" -}}
{{- if eq (include "chess-tactics.isTestEnv" .) "true" -}}
{{- .Release.Namespace -}}
{{- else -}}
{{- .Values.namespace | default .Release.Namespace -}}
{{- end -}}
{{- end -}}
