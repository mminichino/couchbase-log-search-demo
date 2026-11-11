package com.couchbase.logdemo.generator.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "generator")
public class GeneratorProperties {

  private long seed = 42;
  private String mode = "backfill-then-live";
  private String env = "demo";
  private String topology = "classpath:topology.yaml";
  private Backfill backfill = new Backfill();
  private Live live = new Live();
  private Logstash logstash = new Logstash();

  public long getSeed() {
    return seed;
  }

  public void setSeed(long seed) {
    this.seed = seed;
  }

  public String getMode() {
    return mode;
  }

  public void setMode(String mode) {
    this.mode = mode;
  }

  public String getEnv() {
    return env;
  }

  public void setEnv(String env) {
    this.env = env;
  }

  public String getTopology() {
    return topology;
  }

  public void setTopology(String topology) {
    this.topology = topology;
  }

  public Backfill getBackfill() {
    return backfill;
  }

  public void setBackfill(Backfill backfill) {
    this.backfill = backfill;
  }

  public Live getLive() {
    return live;
  }

  public void setLive(Live live) {
    this.live = live;
  }

  public Logstash getLogstash() {
    return logstash;
  }

  public void setLogstash(Logstash logstash) {
    this.logstash = logstash;
  }

  public static class Backfill {
    private int hours = 48;
    private double avgEps = 5;
    private double maxSendEps = 2000;

    public int getHours() {
      return hours;
    }

    public void setHours(int hours) {
      this.hours = hours;
    }

    public double getAvgEps() {
      return avgEps;
    }

    public void setAvgEps(double avgEps) {
      this.avgEps = avgEps;
    }

    public double getMaxSendEps() {
      return maxSendEps;
    }

    public void setMaxSendEps(double maxSendEps) {
      this.maxSendEps = maxSendEps;
    }
  }

  public static class Live {
    private double eps = 20;

    public double getEps() {
      return eps;
    }

    public void setEps(double eps) {
      this.eps = eps;
    }
  }

  public static class Logstash {
    private String host = "logstash";
    private int port = 5000;

    public String getHost() {
      return host;
    }

    public void setHost(String host) {
      this.host = host;
    }

    public int getPort() {
      return port;
    }

    public void setPort(int port) {
      this.port = port;
    }
  }
}
