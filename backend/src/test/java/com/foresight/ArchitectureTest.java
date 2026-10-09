package com.foresight;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.repository.Repository;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAPackage;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/** Enforces the module boundaries documented in docs/architecture.md. */
class ArchitectureTest {

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.foresight");
    }

    @Test
    void modulesAreFreeOfCycles() {
        slices().matching("com.foresight.(*)..").should().beFreeOfCycles().check(classes);
    }

    @Test
    void controllersDoNotUseRepositories() {
        noClasses().that().resideInAPackage("..api..")
                .should().dependOnClassesThat().areAssignableTo(Repository.class)
                .check(classes);
    }

    @Test
    void riskEngineIsPureJava() {
        noClasses().that().resideInAPackage("com.foresight.risk.engine..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "org.springframework..", "jakarta.persistence..", "com.foresight.risk.domain..",
                        "com.foresight.risk.application..", "com.foresight.task..", "com.foresight.project..")
                .check(classes);
    }

    @Test
    void lowerModulesDoNotDependOnHigherOnes() {
        noClasses().that().resideInAnyPackage("com.foresight.identity..", "com.foresight.workspace..",
                        "com.foresight.project..", "com.foresight.task..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.foresight.risk..", "com.foresight.recommendation..", "com.foresight.inbox..")
                .check(classes);
        noClasses().that().resideInAPackage("com.foresight.risk..")
                .should().dependOnClassesThat().resideInAnyPackage("com.foresight.recommendation..", "com.foresight.inbox..")
                .check(classes);
        noClasses().that().resideInAPackage("com.foresight.recommendation..")
                .should().dependOnClassesThat().resideInAPackage("com.foresight.inbox..")
                .check(classes);
    }

    @Test
    void repositoriesAreOnlyUsedInsideTheirModule() {
        for (String module : new String[]{"identity", "workspace", "project", "task", "risk", "recommendation", "inbox"}) {
            String pkg = "com.foresight." + module + "..";
            noClasses().that().resideOutsideOfPackage(pkg)
                    .should().dependOnClassesThat(resideInAPackage(pkg).and(assignableTo(Repository.class)))
                    .because("cross-module access goes through application-layer APIs")
                    .check(classes);
        }
    }
}
