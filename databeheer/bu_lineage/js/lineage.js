async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];
  const metaByNode = new Map();

  function addNode(id, label, type, meta = null) {
    if (!nodes.has(id)) {
      nodes.set(id, { data: { id, label, type, meta } });
      if (meta) metaByNode.set(id, meta);
    }
  }

  events.forEach(event => {
    const jobId = "job:" + event.job.name;
    addNode(jobId, event.job.name, "job");

    (event.inputs || []).forEach(input => {
      const meta = input.facets?.metadata?.meta;
      const id = "ds:" + input.namespace + "." + input.name;
      addNode(id, input.name, "dataset", meta);
      edges.push({ data: { source: id, target: jobId, label: "input" } });
    });

    (event.outputs || []).forEach(output => {
      const meta = output.facets?.metadata?.meta;
      const id = "ds:" + output.namespace + "." + output.name;
      addNode(id, output.name, "dataset", meta);
      edges.push({ data: { source: jobId, target: id, label: "output" } });
    });
  });

  const cy = cytoscape({
    container: document.getElementById("lineage"),
    elements: [...nodes.values(), ...edges],
    layout: {
      name: "dagre",
      rankDir: "LR",
      nodeSep: 80,
      rankSep: 120,
      padding: 40
    },
style: [style: [
  /* Basisstijl voor alle nodes */
  {
    selector: "node",
    style: {
      "label": "data(label)",
      "font-size": 16,
      "font-weight": 600,
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

  /* Dataset-nodes */
  {
    selector: "node[type='dataset']",
    style: {
      "shape": "round-rectangle",
      "background-color": "#e3f2fd",
      "border-color": "#1565c0",
      "border-width": 1
    }
  },

  /* Job-nodes (pilvorm) */
  {
    selector: "node[type='job']",
    style: {
      "shape": "round-rectangle",
      "corner-radius": 999,
      "background-color": "#fff3e0",
      "border-color": "#ef6c00",
      "border-width": 1,
      "font-weight": 400
    }
  },

  /* Edges */
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-color": "#999",
      "target-arrow-color": "#555",
      "label": "data(label)",
      "font-size": 10,
      "color": "#555"
    }
  }
]
  });

  cy.fit();

  cy.on("tap", "node[type='dataset']", evt => {
    const meta = evt.target.data("meta") || {};
    let html = "<table>";

    for (const [k, v] of Object.entries(meta)) {
      if (!v) continue;
      html += `<tr><th>${k.replaceAll("_", " ")}</th><td>${v}</td></tr>`;
    }

    html += "</table>";
    document.getElementById("details-content").innerHTML = html;
  });
}

loadLineage();