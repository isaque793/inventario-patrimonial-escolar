export const TUTORIAL_ACTIVE_KEY = "inventario-tutorial-active-v1";
export const TUTORIAL_COMPLETE_KEY = "inventario-tutorial-complete-v1";

export function isTutorialActive(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(TUTORIAL_ACTIVE_KEY) === "1";
}

export function isTutorialComplete(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(TUTORIAL_COMPLETE_KEY) === "1";
}

export function activateTutorial(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TUTORIAL_ACTIVE_KEY, "1");
}

export function restartTutorial(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TUTORIAL_COMPLETE_KEY);
  localStorage.setItem(TUTORIAL_ACTIVE_KEY, "1");
}

export function completeTutorial(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TUTORIAL_COMPLETE_KEY, "1");
  localStorage.removeItem(TUTORIAL_ACTIVE_KEY);
}

type DemoItem = {
  id: number;
  propertyNumber: string;
  description: string;
  technicalDetails: string | null;
  expenseCode: string;
  conservationCode: string | null;
  conservationState: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  currentSituation: string;
};

type DemoIssue = {
  id: number;
  issueType: string;
  propertyNumber: string | null;
  quantity: number | null;
  description: string;
  conservationState: string | null;
  location: string | null;
  totalValue: number | null;
  originBody: string | null;
  currentSituation: string | null;
  pendingDescription: string;
  measuresTaken: string | null;
  resolutionStatus: string;
};

type DemoMember = { id: number; name: string; jobTitle: string; masp: string; isPresident: boolean };
type DemoDocument = { id: number; documentType: "opening_minutes" | "responsibility_term" | "closing_minutes"; fileName: string; storageUrl: string };

type DemoState = {
  year: number;
  school: { id: number; name: string; city: string; regionalOffice: string };
  cycle: any | null;
  items: DemoItem[];
  issues: DemoIssue[];
  members: DemoMember[];
  documents: DemoDocument[];
  notes: { problemsFound: string; quantityDivergences: string; valueDivergences: string };
  history: Array<{ id: number; action: string; createdAt: string }>;
  nextId: number;
};

const expenseCategories = [
  ["52.01", "Equipamentos e materiais de informática"],
  ["52.02", "Mobiliário escolar"],
  ["52.03", "Eletrodomésticos"],
  ["52.04", "Equipamentos audiovisuais"],
  ["52.05", "Máquinas e equipamentos"],
  ["52.06", "Material de escritório"],
  ["52.07", "Equipamentos de segurança"],
  ["52.08", "Equipamentos de cozinha"],
  ["52.09", "Equipamentos laboratoriais"],
  ["52.10", "Outros equipamentos"],
  ["52.11", "Material permanente"],
  ["52.12", "Tecnologia educacional"],
  ["52.13", "Comunicação"],
  ["52.14", "Mobiliário e utensílios"],
  ["52.15", "Equipamentos de apoio"],
  ["52.16", "Ferramentas"],
  ["52.17", "Instrumentos"],
  ["52.18", "Equipamentos esportivos"],
  ["52.19", "Equipamentos de manutenção"],
  ["52.20", "Veículos e acessórios"],
  ["52.21", "Equipamentos elétricos"],
  ["52.22", "Equipamentos hidráulicos"],
  ["52.25", "Materiais diversos"],
  ["52.26", "Outros bens permanentes"],
  ["52.99", "Outros"],
];

let state: DemoState = createInitialState();

function createInitialState(year = new Date().getFullYear()): DemoState {
  return {
    year,
    school: { id: 1, name: "EE Afonso Pena", city: "Belo Horizonte", regionalOffice: "SRE Metropolitana A" },
    cycle: null,
    items: [],
    issues: [],
    members: [],
    documents: [],
    notes: { problemsFound: "", quantityDivergences: "", valueDivergences: "" },
    history: [],
    nextId: 1,
  };
}

function getInputMap(url: string, init?: RequestInit): Record<string, any> {
  try {
    const requestUrl = new URL(url, window.location.origin);
    const raw = init?.body ? JSON.parse(String(init.body)) : JSON.parse(requestUrl.searchParams.get("input") || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function getInputForIndex(inputMap: Record<string, any>, index: number): any {
  const entry = inputMap[String(index)] ?? inputMap;
  return entry?.json ?? entry?.data?.json ?? entry ?? {};
}

function responseFor(data: unknown) {
  return { result: { data: { json: data } } };
}

function demoOverview(input?: any) {
  const requestedYear = Number(input?.year);
  if (Number.isFinite(requestedYear) && requestedYear > 2000) state.year = requestedYear;
  return {
    school: state.school,
    cycle: state.cycle,
    items: state.items,
    issues: state.issues,
    members: state.members,
    documents: state.documents,
    notes: state.notes,
    history: state.history,
  };
}

function demoSchoolList() {
  return [{
    ...state.school,
    schoolCode: "1546",
    email: "demonstracao@escola.local",
    phone: null,
    responsibleName: "Responsável de demonstração",
    responsibleMasp: "0000000",
    responsibleRole: "Responsável pelo inventário",
    directorName: "Diretor(a) de demonstração",
    directorMasp: "0000000",
  }];
}

function mutate(procedure: string, input: any): any {
  switch (procedure) {
    case "inventory.createCycle": {
      state.cycle = { id: "demo-cycle", year: Number(input?.year) || state.year, status: "draft", submittedAt: null, reviewNotes: null };
      state.year = state.cycle.year;
      return state.cycle;
    }
    case "inventory.addItem": {
      const quantity = Number(input?.quantity) || 1;
      const unitValue = Number(input?.unitValue) || 0;
      const item: DemoItem = {
        id: state.nextId++,
        propertyNumber: String(input?.propertyNumber || ""),
        description: String(input?.description || "Bem de demonstração"),
        technicalDetails: input?.technicalDetails ?? null,
        expenseCode: String(input?.expenseCode || "52.14"),
        conservationCode: input?.conservationCode ?? null,
        conservationState: String(input?.conservationState || "Bom"),
        quantity,
        unitValue,
        totalValue: quantity * unitValue,
        currentSituation: String(input?.currentSituation || "Em uso"),
      };
      state.items.push(item);
      if (item.propertyNumber === "Não se aplica") {
        state.issues = state.issues.filter(issue => issue.issueType !== "outside_register");
        state.issues.push({
          id: state.nextId++,
          issueType: "outside_register",
          propertyNumber: null,
          quantity: item.quantity,
          description: "Bem sem número de patrimônio",
          conservationState: item.conservationState,
          location: null,
          totalValue: item.totalValue,
          originBody: null,
          currentSituation: item.currentSituation,
          pendingDescription: "Regularizar identificação patrimonial.",
          measuresTaken: null,
          resolutionStatus: "open",
        });
      }
      return item;
    }
    case "inventory.updateItem": {
      const item = state.items.find(entry => entry.id === Number(input?.itemId));
      if (!item) return null;
      Object.assign(item, {
        propertyNumber: String(input?.propertyNumber ?? item.propertyNumber),
        description: String(input?.description ?? item.description),
        technicalDetails: input?.technicalDetails ?? null,
        expenseCode: String(input?.expenseCode ?? item.expenseCode),
        conservationCode: input?.conservationCode ?? null,
        conservationState: String(input?.conservationState ?? item.conservationState),
        quantity: Number(input?.quantity ?? item.quantity),
        unitValue: Number(input?.unitValue ?? item.unitValue),
        currentSituation: String(input?.currentSituation ?? item.currentSituation),
      });
      item.totalValue = item.quantity * item.unitValue;
      if (item.propertyNumber !== "Não se aplica") state.issues = state.issues.filter(issue => issue.issueType !== "outside_register");
      return item;
    }
    case "inventory.deleteItem":
      state.items = state.items.filter(item => item.id !== Number(input?.itemId));
      return { ok: true };
    case "inventory.addIssue": {
      const issue: DemoIssue = {
        id: state.nextId++,
        issueType: String(input?.issueType || "other"),
        propertyNumber: input?.propertyNumber ?? null,
        quantity: input?.quantity ?? null,
        description: String(input?.description || "Pendência de demonstração"),
        conservationState: input?.conservationState ?? null,
        location: input?.location ?? null,
        totalValue: input?.totalValue ?? null,
        originBody: input?.originBody ?? null,
        currentSituation: input?.currentSituation ?? null,
        pendingDescription: String(input?.pendingDescription || "Pendência identificada."),
        measuresTaken: input?.measuresTaken ?? null,
        resolutionStatus: String(input?.resolutionStatus || "open"),
      };
      state.issues.push(issue);
      return issue;
    }
    case "inventory.deleteIssue":
      state.issues = state.issues.filter(issue => issue.id !== Number(input?.issueId));
      return { ok: true };
    case "inventory.setCommittee":
      state.members = (input?.members ?? []).map((member: any, index: number) => ({ id: index + 1, name: String(member.name || ""), jobTitle: String(member.jobTitle || ""), masp: String(member.masp || ""), isPresident: Boolean(member.isPresident) }));
      return state.members;
    case "inventory.upsertNotes":
      state.notes = { problemsFound: String(input?.problemsFound || ""), quantityDivergences: String(input?.quantityDivergences || ""), valueDivergences: String(input?.valueDivergences || "") };
      return state.notes;
    case "inventory.uploadDocument": {
      const documentType = input?.documentType as DemoDocument["documentType"];
      state.documents = state.documents.filter(document => document.documentType !== documentType);
      state.documents.push({ id: state.nextId++, documentType, fileName: String(input?.fileName || "Documento de demonstração"), storageUrl: "" });
      return state.documents.at(-1);
    }
    case "inventory.removeDocument":
      state.documents = state.documents.filter(document => document.id !== Number(input?.documentId));
      return { ok: true };
    case "inventory.submit":
      if (state.cycle) {
        state.cycle = { ...state.cycle, status: "submitted", submittedAt: new Date().toISOString() };
        state.history.push({ id: state.nextId++, action: "submitted", createdAt: new Date().toISOString() });
      }
      return state.cycle;
    default:
      return {};
  }
}

export async function tutorialFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isTutorialActive()) return globalThis.fetch(input, init);

  const rawUrl = input instanceof Request ? input.url : String(input);
  const requestUrl = new URL(rawUrl, window.location.origin);
  if (!requestUrl.pathname.startsWith("/api/trpc/")) return globalThis.fetch(input, init);

  const procedures = requestUrl.pathname.replace("/api/trpc/", "").split(",").filter(Boolean);
  const inputMap = getInputMap(requestUrl.toString(), init);
  const body = procedures.map((procedure, index) => {
    const procedureInput = getInputForIndex(inputMap, index);
    if (procedure === "school.list") return responseFor(demoSchoolList());
    if (procedure === "catalog.expenseCategories") return responseFor(expenseCategories.map(([code, label]) => ({ code, label })));
    if (procedure === "inventory.overview") return responseFor(demoOverview(procedureInput));
    if (procedure.startsWith("inventory.")) return responseFor(mutate(procedure, procedureInput));
    return null;
  });

  if (body.some(entry => entry !== null)) {
    const isBatch = requestUrl.searchParams.get("batch") === "1" || procedures.length > 1;
    const payload = isBatch ? body : body[0];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }

  return globalThis.fetch(input, init);
}
