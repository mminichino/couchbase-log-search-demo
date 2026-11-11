package com.couchbase.logdemo.generator.sim.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Topology {

  private List<String> regions = new ArrayList<>();
  private Map<String, String> versions = new HashMap<>();
  private List<ServiceDef> services = new ArrayList<>();
  private List<FlowDef> flows = new ArrayList<>();

  public List<String> getRegions() {
    return regions;
  }

  public void setRegions(List<String> regions) {
    this.regions = regions;
  }

  public Map<String, String> getVersions() {
    return versions;
  }

  public void setVersions(Map<String, String> versions) {
    this.versions = versions;
  }

  public List<ServiceDef> getServices() {
    return services;
  }

  public void setServices(List<ServiceDef> services) {
    this.services = services;
  }

  public List<FlowDef> getFlows() {
    return flows;
  }

  public void setFlows(List<FlowDef> flows) {
    this.flows = flows;
  }

  public ServiceDef service(String name) {
    return services.stream()
        .filter(s -> s.getName().equals(name))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown service: " + name));
  }

  public static class ServiceDef {
    private String name;
    private List<String> hosts = new ArrayList<>();
    private List<EndpointDef> endpoints = new ArrayList<>();

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public List<String> getHosts() {
      return hosts;
    }

    public void setHosts(List<String> hosts) {
      this.hosts = hosts;
    }

    public List<EndpointDef> getEndpoints() {
      return endpoints;
    }

    public void setEndpoints(List<EndpointDef> endpoints) {
      this.endpoints = endpoints;
    }
  }

  public static class EndpointDef {
    private String method;
    private String path;
    private int weight = 1;

    public String getMethod() {
      return method;
    }

    public void setMethod(String method) {
      this.method = method;
    }

    public String getPath() {
      return path;
    }

    public void setPath(String path) {
      this.path = path;
    }

    public int getWeight() {
      return weight;
    }

    public void setWeight(int weight) {
      this.weight = weight;
    }
  }

  public static class FlowDef {
    private String name;
    private int weight = 1;
    private List<HopDef> hops = new ArrayList<>();

    public String getName() {
      return name;
    }

    public void setName(String name) {
      this.name = name;
    }

    public int getWeight() {
      return weight;
    }

    public void setWeight(int weight) {
      this.weight = weight;
    }

    public List<HopDef> getHops() {
      return hops;
    }

    public void setHops(List<HopDef> hops) {
      this.hops = hops;
    }
  }

  public static class HopDef {
    private String service;
    private String method;
    private String path;

    public String getService() {
      return service;
    }

    public void setService(String service) {
      this.service = service;
    }

    public String getMethod() {
      return method;
    }

    public void setMethod(String method) {
      this.method = method;
    }

    public String getPath() {
      return path;
    }

    public void setPath(String path) {
      this.path = path;
    }
  }
}
