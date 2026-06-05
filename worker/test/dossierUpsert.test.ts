import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { runInvestigation } from "../src/investigate.js";
import { FINALIZAR } from "../src/agent/tools/finalizar.js";
import { FakeLlm } from "./fakes.js";

const EMAIL = "test-dossier@example.com";
let userId: string;
let caseId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

function llmWithResumen(resumen: string) {
  return new FakeLlm([
    {
      toolUse: {
        id: "1", name: FINALIZAR,
        input: {
          score: 60, confianza: "media", senales: [], cuentas_vinculadas: [],
          resumen, modo_degradado: true,
        },
      },
    },
  ]);
}

async function newRun(): Promise<string> {
  const { data } = await svc.from("investigation_runs")
    .insert({ case_id: caseId, status: "queued" }).select("id").single();
  return data!.id;
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-dossier%");
  const { data } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestDos2026!", email_confirm: true,
  });
  userId = data.user!.id;
  const { data: c } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-dossier-1", created_by: userId, status: "investigando",
  }).select("id").single();
  caseId = c!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-dossier%");
  await deleteUserByEmail(EMAIL);
});

describe("upsert del dossier desde el veredicto", () => {
  it("crea el dossier draft al terminar la investigación", async () => {
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v1") });
    const { data } = await svc.from("dossiers")
      .select("status, version, content").eq("case_id", caseId).single();
    expect(data!.status).toBe("draft");
    expect(data!.version).toBe(1);
    expect((data!.content as { resumen: string }).resumen).toBe("## v1");
  });

  it("re-investigación refresca el draft y sube la versión", async () => {
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v2") });
    const { data } = await svc.from("dossiers")
      .select("version, content").eq("case_id", caseId).single();
    expect(data!.version).toBe(2);
    expect((data!.content as { resumen: string }).resumen).toBe("## v2");
  });

  it("NO pisa un dossier elevado (listo_admin)", async () => {
    await svc.from("dossiers").update({ status: "listo_admin" }).eq("case_id", caseId);
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v3") });
    const { data } = await svc.from("dossiers")
      .select("status, version, content").eq("case_id", caseId).single();
    expect(data!.status).toBe("listo_admin");
    expect(data!.version).toBe(2); // intacto
    expect((data!.content as { resumen: string }).resumen).toBe("## v2");
  });
});
