package com.foresight;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ForesightApplication {

    public static void main(String[] args) {
        SpringApplication.run(ForesightApplication.class, args);
    }
}
