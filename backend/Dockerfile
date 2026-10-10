# syntax=docker/dockerfile:1

# ---- build ----
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package && cp target/foresight-*.jar app.jar

# ---- run ----
FROM eclipse-temurin:25-jre
RUN groupadd --system foresight && useradd --system --gid foresight --home /app foresight
WORKDIR /app
COPY --from=build /workspace/app.jar app.jar
USER foresight
# Render injects PORT (default 10000); locally the app listens on 8080
ENV PORT=8080
EXPOSE 8080
# Tuned for small instances (e.g. Render's 512 MB free plan)
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
