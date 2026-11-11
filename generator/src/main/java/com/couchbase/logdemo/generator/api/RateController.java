package com.couchbase.logdemo.generator.api;

import com.couchbase.logdemo.generator.config.GeneratorRunner;
import com.couchbase.logdemo.generator.emit.EventEmitter;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/rate")
public class RateController {

  private final GeneratorRunner runner;
  private final EventEmitter emitter;

  public RateController(GeneratorRunner runner, EventEmitter emitter) {
    this.runner = runner;
    this.emitter = emitter;
  }

  @PostMapping
  public Map<String, Object> setRate(@RequestParam double eps) {
    if (eps <= 0 || eps > 10_000) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "eps must be in (0, 10000]");
    }
    runner.setLiveEps(eps);
    emitter.setMaxSendEps(Math.max(eps * 4, 100));
    return Map.of("eps", eps);
  }
}
