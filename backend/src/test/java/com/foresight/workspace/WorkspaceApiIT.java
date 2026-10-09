package com.foresight.workspace;

import com.foresight.support.Api.User;
import com.foresight.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static com.foresight.support.Api.body;
import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceApiIT extends IntegrationTest {

    @Test
    void creatorIsOwnerAndCanManageMembers() {
        User aydan = api.register("Aydan", "aydan@example.com");
        User ulvi = api.register("Ulvi", "ulvi@example.com");
        var ws = api.post(aydan, "/api/v1/workspaces", body("name", "Team Phoenix"));
        assertThat(ws.status()).isEqualTo(201);
        assertThat(ws.text("myRole")).isEqualTo("OWNER");
        String wsId = ws.text("id");

        var added = api.post(aydan, "/api/v1/workspaces/" + wsId + "/members", body("email", "ulvi@example.com", "role", "MEMBER"));
        assertThat(added.status()).isEqualTo(201);
        assertThat(api.post(aydan, "/api/v1/workspaces/" + wsId + "/members",
                body("email", "ulvi@example.com", "role", "MEMBER")).code()).isEqualTo("ALREADY_MEMBER");

        var list = api.get(ulvi, "/api/v1/workspaces");
        assertThat(list.json().path("totalElements").asInt()).isEqualTo(1);
        assertThat(list.json().path("content").get(0).path("myRole").asString()).isEqualTo("MEMBER");

        var members = api.get(ulvi, "/api/v1/workspaces/" + wsId + "/members?sort=role,asc");
        assertThat(members.json().path("totalElements").asInt()).isEqualTo(2);
    }

    @Test
    void membersCannotManageAndNonMembersCannotSee() {
        User owner = api.register("Owner", "o@example.com");
        User member = api.register("Member", "m@example.com");
        User outsider = api.register("Outsider", "x@example.com");
        String wsId = api.post(owner, "/api/v1/workspaces", body("name", "W")).text("id");
        api.post(owner, "/api/v1/workspaces/" + wsId + "/members", body("email", "m@example.com", "role", "MEMBER"));

        assertThat(api.patch(member, "/api/v1/workspaces/" + wsId, body("name", "Hacked")).status()).isEqualTo(403);
        assertThat(api.get(outsider, "/api/v1/workspaces/" + wsId).status()).isEqualTo(404);
        assertThat(api.get(outsider, "/api/v1/workspaces/" + wsId + "/members").status()).isEqualTo(404);
    }

    @Test
    void lastOwnerCannotBeRemovedOrDemoted() {
        User owner = api.register("Owner", "o@example.com");
        String wsId = api.post(owner, "/api/v1/workspaces", body("name", "W")).text("id");
        var demote = api.patch(owner, "/api/v1/workspaces/" + wsId + "/members/" + owner.id(), body("role", "ADMIN"));
        assertThat(demote.status()).isEqualTo(409);
        assertThat(demote.code()).isEqualTo("LAST_OWNER");
        assertThat(api.delete(owner, "/api/v1/workspaces/" + wsId + "/members/" + owner.id()).code()).isEqualTo("LAST_OWNER");
    }

    @Test
    void onlyOwnersGrantOwnerRole() {
        User owner = api.register("Owner", "o@example.com");
        User admin = api.register("Admin", "a@example.com");
        api.register("Other", "other@example.com");
        String wsId = api.post(owner, "/api/v1/workspaces", body("name", "W")).text("id");
        api.post(owner, "/api/v1/workspaces/" + wsId + "/members", body("email", "a@example.com", "role", "ADMIN"));
        var r = api.post(admin, "/api/v1/workspaces/" + wsId + "/members", body("email", "other@example.com", "role", "OWNER"));
        assertThat(r.status()).isEqualTo(403);
        assertThat(api.post(admin, "/api/v1/workspaces/" + wsId + "/members",
                body("email", "other@example.com", "role", "MEMBER")).status()).isEqualTo(201);
    }

    @Test
    void paginationIsBoundedAndSortsAreWhitelisted() {
        User owner = api.register("Owner", "o@example.com");
        for (int i = 0; i < 3; i++) {
            api.post(owner, "/api/v1/workspaces", body("name", "W" + i));
        }
        var page = api.get(owner, "/api/v1/workspaces?size=2&page=1&sort=name,desc");
        assertThat(page.json().path("content").size()).isEqualTo(1);
        assertThat(page.json().path("totalPages").asInt()).isEqualTo(2);
        assertThat(api.get(owner, "/api/v1/workspaces?size=500").status()).isEqualTo(400);
        assertThat(api.get(owner, "/api/v1/workspaces?sort=passwordHash").status()).isEqualTo(400);
    }
}
