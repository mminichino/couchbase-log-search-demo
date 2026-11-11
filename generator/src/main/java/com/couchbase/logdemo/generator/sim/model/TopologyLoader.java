package com.couchbase.logdemo.generator.sim.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;

public final class TopologyLoader {

  private TopologyLoader() {}

  public static Topology load(String location) {
    try {
      Resource resource = new DefaultResourceLoader().getResource(location);
      try (InputStream in = resource.getInputStream()) {
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
        return mapper.readValue(in, Topology.class);
      }
    } catch (IOException e) {
      throw new IllegalStateException("Failed to load topology from " + location, e);
    }
  }
}
