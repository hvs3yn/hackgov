# syntax=docker/dockerfile:1

# ---- build ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/foresight-*.jar app.jar

# ---- run ----
FROM eclipse-temurin:25-jre
RUN groupadd --system foresight && useradd --system --gid foresight --home /app foresight
WORKDIR /app
COPY --from=build /workspace/app.jar app.jar
USER foresight
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
