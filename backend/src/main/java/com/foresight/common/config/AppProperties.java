package com.foresight.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.ZoneId;
import java.util.List;

/**
 * General application settings bound from {@code app.*}.
 *
 * @param timeZone business time zone used to turn instants into calendar dates (due dates, "today")
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        @DefaultValue("UTC") ZoneId timeZone,
        @DefaultValue Cors cors) {

    /** @param allowedOrigins exact origins or patterns, e.g. {@code https://app.example.com}, {@code http://localhost:[*]} */
    public record Cors(@DefaultValue({"http://localhost:[*]", "http://127.0.0.1:[*]"}) List<String> allowedOrigins) {
    }
}
