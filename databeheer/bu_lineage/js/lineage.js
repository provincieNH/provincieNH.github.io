async function loadLineage() {
  const response = await fetch("openlineage_events.json");
  const events = await response.json();

  const nodes = new Map();
  const edges = [];

  function addNode(id, label, type) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        data: { id, label, type }
      });
    }
  }

  events.forEach(event => {
    const jobId = `job:${event.job.name}`;
    addNode(jobId, event.job.name, "job");

    (event.inputs || []).forEach(input => {
      const inputId = `ds:${input.namespace}.${input.name}`;
      addNode(inputId, input.name, "dataset");

      edges.push({
        data: {
          source: inputId,
          target: jobId,
          label: "input"
        }
      });
    });

    (event.outputs || []).forEach(output => {
      const outputId = `ds:${output.namespace}.${output.name}`;
      addNode(outputId, output.name, "dataset");

      edges.push({
        data: {
          source: jobId,
          target: outputId,
          label: "output"
        }
      });
    });
  });

  cytoscape({
    container: document.getElementById("lineage"),
    elements: [
      ...nodes.values(),
      ...edges
    ],
    layout: {
  name: "breadthfirst",
  directed: true,
  spacingFactor: 1.4,
  padding: 40
    },
    style: [
      {
        selector: "node[type = 'dataset']",
        style: [
  {
    selector: "node",
    style: {
      "label": "data(label)",
      "color": "#000000",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 12,
      "text-wrap": "wrap",
      "text-max-width": 120,
      "padding": "10px",
      "width": "label",
      "height": "label",
      "shape": "round-rectangle"
    }
  },
  {
    selector: "node[type = 'dataset']",
    style: {
      "background-color": "#e3f2fd",
      "border-width": 1,
      "border-color": "#1565c0"
    }
  },
  {
    selector: "node[type = 'job']",
    style: {
      "background-color": "#fff3e0",
      "border-width": 1,
      "border-color": "#ef6c00",
      "shape": "ellipse"
    }
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#555",
      "line-color": "#999",
      "label": "data(label)",
      "font-size": 9,
      "color": "#555"
    }
  }
]
      },
      {
        selector: "node[type = 'job']",
        style: {
          "background-color": "#ef6c00",
          "label": "data(label)",
          "color": "#ffffff",
          "text-valign": "center",
          "shape": "ellipse"
        }
      },
      {
        selector: "edge",
        style: {
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "label": "data(label)",
          "font-size": 10
        }
      }
    ]
  });
}

loadLineage();