async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];

  function addNode(id, label, type, meta = {}) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        data: { id, label, type, meta }
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
      addNode(dsId, input.name, "dataset", dsMeta);
      edges.push({ data: { source: dsId, target: jobId } });
    });

    (event.outputs || []).forEach(output => {
      const dsId = "ds:" + output.namespace + "." + output.name;
      const dsMeta = output.facets?.metadata?.meta || {};
      addNode(dsId, output.name, "dataset", dsMeta);
      edges.push({ data: { source: jobId, target: dsId } });
    });
  });

  const cy = cytoscape({
    container: document.getElementById("lineage"),
    elements: [...nodes.values(), ...edges],
    layout: {
      name: "dagre",
      rankDir: "LR",
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
      {
        selector: ".faded",
        style: {
          "opacity": 0.15
        }
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

  // Hover: upstream + downstream highlight
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

  // Klik → metadata (dataset of job)
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