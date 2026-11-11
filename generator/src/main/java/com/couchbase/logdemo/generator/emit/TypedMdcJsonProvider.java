package com.couchbase.logdemo.generator.emit;

import ch.qos.logback.classic.spi.ILoggingEvent;
import com.fasterxml.jackson.core.JsonGenerator;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import net.logstash.logback.composite.AbstractFieldJsonProvider;
import net.logstash.logback.composite.JsonWritingUtils;

/**
 * Writes MDC entries with numeric coercion for known integer fields. Omits null/blank values.
 */
public class TypedMdcJsonProvider extends AbstractFieldJsonProvider<ILoggingEvent> {

  private static final Set<String> INT_KEYS = Set.of("ts_ms", "http_status", "duration_ms");

  @Override
  public void writeTo(JsonGenerator generator, ILoggingEvent event) throws IOException {
    Map<String, String> mdc = event.getMDCPropertyMap();
    if (mdc == null || mdc.isEmpty()) {
      return;
    }
    for (Map.Entry<String, String> entry : mdc.entrySet()) {
      String key = entry.getKey();
      String value = entry.getValue();
      if (value == null || value.isBlank()) {
        continue;
      }
      if (INT_KEYS.contains(key)) {
        try {
          generator.writeNumberField(key, Long.parseLong(value));
          continue;
        } catch (NumberFormatException ignored) {
          // fall through to string
        }
      }
      JsonWritingUtils.writeStringField(generator, key, value);
    }
  }
}
