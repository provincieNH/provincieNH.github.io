async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];

  function medailleKleur(medaille) {
    if (!medaille) return "#FFFFFF";

    const m = medaille.toLowerCase();

    if (m === "goud") return "#D4AF37";
    if (m === "zilver") return "#C0C0C0";
    if (m === "brons") return "#CD7F32";

    return "#1565c0";
  }

  function addNode(id, label, type, meta = {}) {
    if (!nodes.has(id)) {

      const medaille = meta.dataset_medaille;
      const borderColor = medailleKleur(medaille);

      nodes.set(id, {
        data: {
          id,
          label,
          type,
          meta,
          borderColor,
          borderWidth: type === "dataset" ? 4 : 1
        }
      });
    }
  }

  events.forEach(event => {

    const jobMeta = event.job.facets?.metadata?.meta || {};
    const jobId = "job:" + event.job.name;
    const jobLabel = jobMeta.naam || event.job.name;

    addNode(jobId, jobLabel, "job", jobMeta);

    (event.inputs || []).forEach(input => {

      const dsId = "ds:" + input.namespace + "." + input.name;
      const dsMeta = input.facets?.metadata?.meta || {};
      const dsLabel = dsMeta?.naam ? dsMeta.naam : input.name;

      addNode(dsId, dsLabel, "dataset", dsMeta);

      edges.push({
        data: {
          source: dsId,
          target: jobId
        }
      });

    });

    (event.outputs || []).forEach(output => {

      const dsId = "ds:" + output.namespace + "." + output.name;
      const dsMeta = output.facets?.metadata?.meta || {};
      const dsLabel = dsMeta?.naam ? dsMeta.naam : output.name;

      addNode(dsId, dsLabel, "dataset", dsMeta);

      edges.push({
        data: {
          source: jobId,
          target: dsId
        }
      });

    });

  });

  const cy = cytoscape({
    container: document.getElementById("lineage"),
    elements: [...nodes.values(), ...edges],

    layout: {
      name: "dagre",
      rankDir: "LR",
      nodeSep: 80,
      edgeSep: 40,
      rankSep: 140,
      padding: 40
    },

    style: [

      {
        selector: "node",
        style: {
          "label": "data(label)",
          "font-size": 15,
          "text-wrap": "wrap",
          "text-max-width": 180,
          "padding": "14px",
          "width": "label",
          "height": "label",
          "text-valign": "center",
          "text-halign": "center",
          "color": "#333",
          "z-index": 10
        }
      },

      {
        selector: "node[type='dataset']",
        style: {
          "shape": "round-rectangle",
          "background-color": "#e3f2fd",
          "border-color": "data(borderColor)",
          "border-width": "data(borderWidth)"
        }
      },

      {
        {
          selector: "node[type='job']",
          style: {
            "shape": "round-rectangle",
            "corner-radius": 999,
            "background-color": "#fff3e0",
            "border-color": "#ef6c00",
            "border-width": 2,
            "width": 140,
            "height": 50
          }
        },

      {
        selector: ".faded",
        style: {
          "opacity": 0.15
        }
      },

      {
        selector: "edge",
        style: {
          "curve-style": "straight",
          "target-arrow-shape": "triangle",
          "arrow-scale": 1.1,
          "line-color": "#9aa0a6",
          "target-arrow-color": "#9aa0a6",
          "width": 2,
          "z-index": 1
        }
      },

      {
        selector: "edge.backflow",
        style: {
          "curve-style": "unbundled-bezier",
          "control-point-step-size": 60
        }
      }

    ]
  });

  cy.fit();

  cy.edges().forEach(edge => {
    const source = edge.source().position();
    const target = edge.target().position();

    if (target.x < source.x) {
      edge.addClass("backflow");
    }
  });

  cy.on("mouseover", "node", evt => {
    const n = evt.target;
    cy.elements().addClass("faded");
    n.removeClass("faded");
    n.predecessors().removeClass("faded");
    n.successors().removeClass("faded");
  });

  cy.on("mouseout", "node", () => {
    cy.elements().removeClass("faded");
  });

  cy.on("tap", "node", evt => {

    const meta = evt.target.data("meta") || {};
    let html = "<table>";

    for (const [k, v] of Object.entries(meta)) {
      if (!v) continue;
      html += `<tr><th>${k}</th><td>${v}</td></tr>`;
    }

    html += "</table>";

    document.getElementById("details-content").innerHTML = html;

  });
}

loadLineage();