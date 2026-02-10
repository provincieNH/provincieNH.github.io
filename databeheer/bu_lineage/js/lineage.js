async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];

  function addNode(id, label, type, meta = {}) {
    if (!nodes.has(id)) {
      nodes.set(id, { data: { id, label, type, meta } });
    }
  }

  events.forEach(event => {
    const jobId = "job:" + event.job.name;
    addNode(jobId, event.job.name, "job");

    (event.inputs || []).forEach(input => {
      const meta = input.facets?.metadata?.meta || {};
      const id = "ds:" + input.namespace + "." + input.name;
      addNode(id, input.name, "dataset", meta);
      edges.push({ data: { source: id, target: jobId } });
    });

    (event.outputs || []).forEach(output => {
      const meta = output.facets?.metadata?.meta || {};
      const id = "ds:" + output.namespace + "." + output.name;
      addNode(id, output.name, "dataset", meta);
      edges.push({ data: { source: jobId, target: id } });
    });
  });

  const cy = cytoscape({
    container: document.getElementById("lineage"),
    elements: [...nodes.values(), ...edges],
    layout: { name: "dagre", rankDir: "LR", padding: 40 },
    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "font-size": 16,
          "text-wrap": "wrap",
          "text-max-width": 180,
          "padding": "14px",
          "width": "label",
          "height": "label",
          "text-valign": "center",
          "text-halign": "center",
          "color": "#333"
        }
      },
      {
        selector: "node[type='dataset']",
        style: {
          "shape": "round-rectangle",
          "background-color": "#e3f2fd",
          "border-color": "#1565c0",
          "border-width": 1
        }
      },
      {
        selector: "node[type='job']",
        style: {
          "shape": "round-rectangle",
          "corner-radius": 999,
          "background-color": "#fff3e0",
          "border-color": "#ef6c00",
          "border-width": 1
        }
      },

      /* Classificatie-accenten */
      { selector: "node[type='dataset'][meta.classificatie = 'Open']",
        style: { "border-left-width": 6, "border-left-color": "#4caf50" } },
      { selector: "node[type='dataset'][meta.classificatie = 'PNH']",
        style: { "border-left-width": 6, "border-left-color": "#003b6c" } },
      { selector: "node[type='dataset'][meta.classificatie = 'Vertrouwelijk']",
        style: { "border-left-width": 6, "border-left-color": "#ef6c00" } },

      {
        selector: ".faded",
        style: { "opacity": 0.15 }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "line-color": "#999",
          "target-arrow-color": "#555"
        }
      }
    ]
  });

  cy.fit();

  /* Hover highlight */
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

  /* Klik → metadata */
  cy.on("tap", "node[type='dataset']", evt => {
    const meta = evt.target.data("meta") || {};
    let html = "<table>";
    for (const [k, v] of Object.entries(meta)) {
      if (!v) continue;
      html += `<tr><th>${k.replaceAll("_"," ")}</th><td>${v}</td></tr>`;
    }
    html += "</table>";
    document.getElementById("details-content").innerHTML = html;
  });

  /* Zoekfunctie */
  const input = document.getElementById("searchInput");
  const hitCount = document.getElementById("hitCount");

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    if (!q) {
      cy.elements().removeClass("faded");
      hitCount.textContent = "";
      return;
    }

    let hits = 0;
    cy.nodes().forEach(n => {
      const text = (
        n.data("label") +
        JSON.stringify(n.data("meta") || {})
      ).toLowerCase();

      if (text.includes(q)) {
        n.removeClass("faded");
        n.predecessors().removeClass("faded");
        n.successors().removeClass("faded");
        hits++;
      } else {
        n.addClass("faded");
      }
    });

    hitCount.textContent = `${hits} resultaten`;
  });
}

loadLineage();