import { useEffect, useState, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Play, Pause, Search } from 'lucide-react';

export interface GraphNode {
  id: string;
  canonical_name: string;
  type: string;
  aliases?: string[];
  properties?: Record<string, any>;
  permissions_hash?: string | null;
}

export interface GraphRelationship {
  id: string;
  type: string;
  source_node_id: string;
  target_node_id: string;
  confidence: number;
}

interface ForceNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
}

interface ForceLink {
  id: string;
  source: string;
  target: string;
  type: string;
}

export function GraphViewer() {
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const [links, setLinks] = useState<ForceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    async function fetchGraphData() {
      try {
        const [nodesRes, edgesRes] = await Promise.all([
          fetch('/api/graph/nodes').then((r) => {
            if (!r.ok) throw new Error('Nodes endpoint failed');
            return r.json() as Promise<GraphNode[]>;
          }),
          fetch('/api/graph/edges').then((r) => {
            if (!r.ok) throw new Error('Edges endpoint failed');
            return r.json() as Promise<GraphRelationship[]>;
          }),
        ]);

        const width = 800;
        const height = 500;

        const forceNodes: ForceNode[] = nodesRes.map((n, i) => {
          const angle = (i / nodesRes.length) * 2 * Math.PI;
          const r = 150 + Math.random() * 50;
          return {
            id: n.id,
            label: n.canonical_name,
            type: n.type || 'Fact',
            x: width / 2 + r * Math.cos(angle),
            y: height / 2 + r * Math.sin(angle),
            vx: 0,
            vy: 0,
          };
        });

        const forceLinks: ForceLink[] = edgesRes.map((e) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          type: e.type,
        }));

        setNodes(forceNodes);
        setLinks(forceLinks);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load graph nodes and relationships');
        setLoading(false);
      }
    }

    void fetchGraphData();
  }, []);

  // Force-directed layout physics loop
  useEffect(() => {
    if (!isRunning || loading || nodes.length === 0) return;

    const width = 800;
    const height = 500;
    const kAttract = 0.04;
    const kRepel = 2000;
    const gravity = 0.02;
    const damping = 0.85;

    function updatePhysics() {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((n) => ({
          ...n,
          fx: n.id === draggedNodeId ? n.x : null,
          fy: n.id === draggedNodeId ? n.y : null,
        }));

        const nodeMap = new Map<string, ForceNode>();
        for (const n of nextNodes) nodeMap.set(n.id, n);

        // Coulomb's repulsion force between all node pairs
        for (let i = 0; i < nextNodes.length; i++) {
          const n1 = nextNodes[i];
          for (let j = i + 1; j < nextNodes.length; j++) {
            const n2 = nextNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy || 1;
            const dist = Math.sqrt(distSq);

            if (dist < 400) {
              const force = kRepel / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (!n1.fx) {
                n1.vx -= fx;
                n1.vy -= fy;
              }
              if (!n2.fx) {
                n2.vx += fx;
                n2.vy += fy;
              }
            }
          }
        }

        // Hooke's attraction force along links
        for (const link of links) {
          const n1 = nodeMap.get(link.source);
          const n2 = nodeMap.get(link.target);
          if (!n1 || !n2) continue;

          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const restLength = 120;
          const force = kAttract * (dist - restLength);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!n1.fx) {
            n1.vx += fx;
            n1.vy += fy;
          }
          if (!n2.fx) {
            n2.vx -= fx;
            n2.vy -= fy;
          }
        }

        // Gravity towards center & update positions
        for (const n of nextNodes) {
          if (n.id === draggedNodeId) continue;

          n.vx += (width / 2 - n.x) * gravity;
          n.vy += (height / 2 - n.y) * gravity;

          n.vx *= damping;
          n.vy *= damping;

          n.x += n.vx;
          n.y += n.vy;

          // Clamp within bounding box
          n.x = Math.max(20, Math.min(width - 20, n.x));
          n.y = Math.max(20, Math.min(height - 20, n.y));
        }

        return nextNodes;
      });

      animationRef.current = requestAnimationFrame(updatePhysics);
    }

    animationRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRunning, loading, links, draggedNodeId]);

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNodeId(nodeId);
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      dragStartRef.current = {
        x: (e.clientX - rect.left) / zoom - pan.x,
        y: (e.clientY - rect.top) / zoom - pan.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNodeId || !dragStartRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / zoom - pan.x;
    const currentY = (e.clientY - rect.top) / zoom - pan.y;

    setNodes((current) =>
      current.map((n) => {
        if (n.id === draggedNodeId) {
          return {
            ...n,
            x: currentX,
            y: currentY,
            vx: 0,
            vy: 0,
          };
        }
        return n;
      }),
    );
  };

  const handleMouseUp = () => {
    setDraggedNodeId(null);
    dragStartRef.current = null;
  };

  const getNodeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'person':
        return '#a855f7'; // Purple
      case 'project':
        return '#14b8a6'; // Teal
      case 'organization':
        return '#3b82f6'; // Blue
      case 'incident':
      case 'fact':
        return '#f59e0b'; // Amber
      default:
        return '#6b7280'; // Grey
    }
  };

  const resetGraph = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) return <div className="empty-card">Loading knowledge graph...</div>;
  if (error) return <div className="empty-card" style={{ color: 'var(--brand-coral)' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Search and controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search nodes by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '9px 12px 9px 36px',
              borderRadius: 12,
              border: '1px solid var(--hairline)',
              background: 'var(--surface-card)',
              color: 'var(--ink)',
              fontSize: 13,
              width: '100%',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="secondary-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}
          >
            {isRunning ? <Pause size={14} /> : <Play size={14} />}
            {isRunning ? 'Pause Physics' : 'Resume Physics'}
          </button>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="secondary-button" style={{ padding: 8 }}>
            <ZoomIn size={16} />
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="secondary-button" style={{ padding: 8 }}>
            <ZoomOut size={16} />
          </button>
          <button onClick={resetGraph} className="secondary-button" style={{ padding: 8 }}>
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Main Canvas view */}
      <div
        style={{
          border: '1px solid var(--hairline)',
          borderRadius: 16,
          background: 'var(--canvas)',
          overflow: 'hidden',
          position: 'relative',
          height: 500,
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 800 500"
          style={{ cursor: draggedNodeId ? 'grabbing' : 'grab' }}
        >
          {/* Drop shadow glow definition */}
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Scale and pan translation container */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Draw Relationships */}
            {links.map((link) => {
              const sourceNode = nodes.find((n) => n.id === link.source);
              const targetNode = nodes.find((n) => n.id === link.target);
              if (!sourceNode || !targetNode) return null;

              return (
                <g key={link.id}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="var(--hairline)"
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                  {/* Small relationship label */}
                  <text
                    x={(sourceNode.x + targetNode.x) / 2}
                    y={(sourceNode.y + targetNode.y) / 2 - 4}
                    fill="var(--muted-soft)"
                    fontSize={8}
                    textAnchor="middle"
                  >
                    {link.type}
                  </text>
                </g>
              );
            })}

            {/* Draw Nodes */}
            {nodes.map((node) => {
              const isMatch = searchQuery && node.label.toLowerCase().includes(searchQuery.toLowerCase());
              const color = getNodeColor(node.type);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(e) => handleMouseDown(e, node.id)}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={16}
                    fill={color}
                    stroke={isMatch ? '#ffffff' : 'var(--hairline)'}
                    strokeWidth={isMatch ? 3 : 1.5}
                    filter={isMatch ? 'url(#glow)' : undefined}
                    style={{ transition: 'r 150ms' }}
                  />
                  <text
                    y={30}
                    fill="var(--ink)"
                    fontSize={11}
                    fontWeight={isMatch ? 'bold' : 500}
                    textAnchor="middle"
                    style={{
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                    }}
                  >
                    {node.label.length > 20 ? `${node.label.slice(0, 17)}...` : node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover Information Tooltip */}
        {hoveredNode && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              background: 'rgba(25, 25, 30, 0.95)',
              border: '1px solid var(--hairline)',
              borderRadius: 12,
              padding: '12px 16px',
              maxWidth: 320,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: getNodeColor(hoveredNode.type),
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--muted)',
                }}
              >
                {hoveredNode.type}
              </span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{hoveredNode.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              ID: <code style={{ fontSize: 10, color: 'var(--brand-teal)' }}>{hoveredNode.id}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
