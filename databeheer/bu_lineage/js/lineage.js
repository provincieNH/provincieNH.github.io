async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];
  const datasetMeta = new Map();

  function addNode(id, label, type) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        data: { id, label, type }
      });
    }
  }

  // Verzamel nodes + metadata
  events.forEach(event => {
    const jobId = "job:" + event.job.name;
    addNode(jobId, event.job.name, "job");

    (event.inputs || []).forEach(input => {
      const id = "ds:" + input.namespace + "." + input.name;
      addNode(id, input.name, "dataset");

      datasetMeta.set(id, {
        rol: "input",
        namespace: input.namespace,
        naam: input.name,
        job: event.job.name
      });

      edges.push({
        data: { source: id, target: jobId, label: "input" }
      });
    });

    (event.outputs || []).forEach(output => {
      const id = "ds:" + output.namespace + "." + output.name;
      addNode(id, output.name, "dataset");

      datasetMeta.set(id, {
        rol: "output",
        namespace: output.namespace,
        naam: output.name,
        job: event.job.name
      });

      edges.push({
        data: { source: jobId, target: id, label: "output" }
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
      rankSep: 120,
      padding: 40
    },
    style: [
      {
        selector: "node",
        style: {
          "label": "data(label)",
          "color": "#000",
          "font-size": 16,
          "text-wrap": "wrap",
          "text-max-width": 180,
          "padding": "14px",
          "width": "label",
          "height": "label",
          "text-valign": "center",
          "text-halign": "center"
        }
      },
      {
        selector: "node[type = 'dataset']",
        style: {
          "shape": "round-rectangle",
          "background-color": "#e3f2fd",
          "border-color": "#1565c0",
          "border-width": 1
        }
      },
      {
        selector: "node[type = 'job']",
        style: {
          "shape": "ellipse",
          "background-color": "#fff3e0",
          "border-color": "#ef6c00",
          "border-width": 1
        }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "line-color": "#999",
          "target-arrow-color": "#555",
          "font-size": 10,
          "color": "#555",
          "label": "data(label)"
        }
      }
    ]
  });

  cy.fit();

  // ✅ Klik op dataset → toon metadata
  cy.on("tap", "node[type = 'dataset']", evt => {
    const node = evt.target;
    const meta = datasetMeta.get(node.id());

    const panel = document.getElementById("details-content");
    panel.innerHTML = `
      <p><strong>Naam:</strong> ${meta.naam}</p>
      <p><strong>Namespace:</strong> ${meta.namespace}</p>
      <p><strong>Rol:</strong> ${meta.rol}</p>
      <p><strong>Gekoppeld aan job:</strong> ${meta.job}</p>
    `;
  });
}

loadLineage();