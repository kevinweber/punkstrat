import { h, useEffect, useRef, useState } from '../../libs/preact.js';
import htm from '../../libs/htm.js';
import LogoLinkHome from '../../components/LogoLinkHome.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8/+esm';

const html = htm.bind(h);

const strokeWidth = 2;

function Wheel({ width, height, }) {
  const [viewBox, setViewBox] = useState('0,0,0,0');
  const [segementsActive, setSegmentsActive] = useState([]);

  const svgRef = useRef(null);
  const segmentGap = 0;
  const radius = width / 2;

  // https://gist.github.com/FrissAnalytics/2332b91857d2d9c0c1eb5e0ca62cb56b#formatting-the-data-d3
  const partition = (data) =>
    d3.partition().size([2 * Math.PI, radius])(
      d3
        .hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value)
    );

  const arc = d3
    .arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    // Spacing between areas
    // .padAngle(1 / radius)
    .padAngle(segmentGap / radius)
    .padRadius(radius)
    // Segment gap = spacing between segments (slides) within an area
    .innerRadius(d => d.y0 + segmentGap)
    .outerRadius(d => d.y1);

  const mousearc = d3
    .arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => d.y0)
    .outerRadius(radius);

  function buildHierarchy(csv) {
    // Helper function that transforms the given CSV-compatible data into a hierarchical format.
    const root = { name: 'root', id: 'root', children: [] };
    for (let i = 0; i < csv.length; i++) {
      const sequence = csv[i][0];
      const size = +csv[i][1];
      if (isNaN(size)) {
        // e.g. if this is a header row
        continue;
      }
      const parts = sequence.split('-');
      let currentNode = root;
      for (let j = 0; j < parts.length; j++) {
        const children = currentNode['children'];
        const nodeName = parts[j];
        let childNode = null;
        if (j + 1 < parts.length) {
          // Not yet at the end of the sequence; move down the tree.
          let foundChild = false;
          for (let k = 0; k < children.length; k++) {
            if (children[k]['name'] == nodeName) {
              childNode = children[k];
              foundChild = true;
              break;
            }
          }
          // If we don't already have a child node for this branch, create it.
          if (!foundChild) {
            childNode = { name: nodeName, id: `${nodeName}-${i}-${j}`, children: [] };
            children.push(childNode);
          }
          currentNode = childNode;
        } else {
          // Reached the end of the sequence; create a leaf node.
          childNode = { name: nodeName, id: `${nodeName}-${i}-${j}`, value: size };
          children.push(childNode);
        }
      }
    }

    return root;
  }

  function generateArea(areaMeta) {
    return areaMeta.map(({ label, depth = 10, weight = 1 }) => {
      // TODO: Instead of duplicating the label and then taking it apart within `buildHierarchy`, refactor the code and avoid this inefficiency
      const segmentLabel = [new Array(depth).fill(label).join('-')];
      segmentLabel.push(weight);
      return segmentLabel;
    });
  }

  // 8 areas (a, b, c, ...), each 10 levels deep, taking up 1 space within the circle
  const segments = (generateArea([{
    label: 'Finances',
  }, {
    label: 'Personal Growth',
  }, {
    label: 'Health',
  }, {
    label: 'Family',
  }, {
    label: 'Love & Relationships',
  }, {
    label: 'Fun & Recreation',
  }, {
    label: 'Mind & Meaning',
  }, {
    label: 'Career',
  },
  ]));

  const data = buildHierarchy(segments);
  const root = partition(data);

  const getAutoBox = () => {
    if (!svgRef.current) { return ''; }
    const { x, y, width, height } = svgRef.current.getBBox();
    return [x - strokeWidth / 2, y - strokeWidth / 2, width + strokeWidth, height + strokeWidth].toString();
  };

  useEffect(() => {
    setViewBox(getAutoBox());
  }, []);

  function onmouseenter(e, d) {
    // Get the ancestors of the current segment, minus the root
    const sequence = d
      .ancestors()
      .reverse()
      .slice(1);

    const activeSegments = sequence.map(node => node.data.id);
    setSegmentsActive(activeSegments);
  }

  return html`<svg width=${width} height=${height} viewBox=${viewBox} ref=${svgRef} style="max-width:100%; overflow:visible">
    <style>
      .segments path {
        stroke-width: ${strokeWidth};
        stroke: var(--color-primary);
        fill: var(--color-darker);
        fill-opacity: 0.6;
      }
      .segments path.active {
        fill: var(--color-primary);
        fill-opacity: 0.9;
      }
      .segments path.selected {
        fill: var(--color-primary);
        fill-opacity: 0.8;
      }
      .hover-areas {
        cursor: pointer;
      }
      .area-labels textPath {
        font-size: 0.8em;
      }
    </style>
    <g class="segments">${root
      .descendants()
      .filter((d) => d.depth) // Don't draw the root node
      .map((d) => {
        return (
          html`<path id=${d.data.id} d=${arc(d)} class=${segementsActive.includes(d.data.id) ? 'active' : ''} />`
        );
      })}
    </g>
    <g class="hover-areas" fill="none" pointer-events="all">
      ${root
      .descendants()
      .filter((d) => d.depth) // Don't draw the root node
      .map((d) => html`<path d=${mousearc(d)} onmouseenter=${e => onmouseenter(e, d)} />`)}
    </g>
    <g class="area-labels">
      ${root
      .descendants()
      .filter((d) => d.depth === 10) // Only draw label for outermost segment
      // Placing text on arcs: https://www.visualcinnamon.com/2015/09/placing-text-on-arcs/
      // We could calculate startOffset more accurately as described in the article.
      // However, for nown, 23.5% is sufficiently close to what we need.
      .map((d) => html`<text fill="#fff" dy=${d.endAngle > 90 * Math.PI / 180 ? 18 : -11}>
        <textPath fill="#fff" startOffset="23.5%" text-anchor="middle" href="#${d.data.id}">${d.data.name}</textPath>
      </text>`)}
    </g>
  </svg>`;
}

export default function Home() {
  return html`
<div class="subpage">
  <div class="title-bar"><h1 class="title wordmark">PunkStrat</h1><h2 class="title wordmark-reverse">Wheel</h2></div>
  <p><${Wheel} width="500" height="500" /></p>
  <${LogoLinkHome}/>
</div>
  `;
}