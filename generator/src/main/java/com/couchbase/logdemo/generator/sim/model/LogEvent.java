package com.couchbase.logdemo.generator.sim.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record LogEvent(
    @JsonProperty("event_id") String eventId,
    @JsonProperty("ts") String ts,
    @JsonProperty("ts_ms") long tsMs,
    String level,
    String service,
    String version,
    String env,
    String host,
    String region,
    String logger,
    String thread,
    String message,
    @JsonProperty("trace_id") String traceId,
    @JsonProperty("span_id") String spanId,
    @JsonProperty("http_method") String httpMethod,
    @JsonProperty("http_path") String httpPath,
    @JsonProperty("http_status") Integer httpStatus,
    @JsonProperty("duration_ms") Integer durationMs,
    @JsonProperty("user_id") String userId,
    @JsonProperty("client_ip") String clientIp,
    @JsonProperty("exception_class") String exceptionClass,
    @JsonProperty("stack_trace") String stackTrace,
    String scenario
) {
}
