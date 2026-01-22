export function suggestEnrichment(missing: string[]) {
    if (missing.length === 0) return [];
  
    const suggestions: string[] = [];
  
    for (const m of missing) {
      const lc = m.toLowerCase();
  
      if (lc.includes("policy") || lc.includes("procedure")) {
        suggestions.push("Upload the relevant internal policy/procedure document (PDF or DOCX) that governs this topic.");
      } else if (lc.includes("financial") || lc.includes("quarter") || lc.includes("revenue")) {
        suggestions.push("Upload quarterly financial reports or management accounts (e.g., Q1–Q4 PDF statements).");
      } else if (lc.includes("contract") || lc.includes("sla")) {
        suggestions.push("Upload the relevant contract/SLA or vendor agreement that defines obligations and timelines.");
      } else if (lc.includes("metric") || lc.includes("kpi") || lc.includes("dashboard")) {
        suggestions.push("Export and upload KPI dashboards or CSV extracts that contain the missing metrics.");
      } else {
        suggestions.push(`Add a document that directly answers: "${m}" (e.g., an internal doc, report, or dataset extract).`);
      }
    }
  
    return [...new Set(suggestions)];
  }
  