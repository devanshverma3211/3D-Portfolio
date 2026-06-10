(function () {
  const canvas = document.getElementById("space-scene");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let intensity = 1;
  let start = performance.now();

  if (!gl) {
    document.body.classList.add("no-webgl");
    return;
  }

  const vertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    attribute float aSize;
    attribute float aPhase;
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform float uTime;
    uniform float uIntensity;
    varying float vDepth;
    varying float vPhase;

    void main() {
      vec3 p = aPosition;
      p.x += sin(uTime * 0.45 + aPhase) * 0.18 * uIntensity;
      p.y += cos(uTime * 0.35 + aPhase) * 0.12 * uIntensity;
      vec4 world = uView * vec4(p, 1.0);
      gl_Position = uProjection * world;
      gl_PointSize = aSize * (240.0 / max(18.0, -world.z));
      vDepth = smoothstep(-80.0, -4.0, world.z);
      vPhase = aPhase;
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform float uTime;
    uniform float uIntensity;
    varying float vDepth;
    varying float vPhase;

    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv);
      float core = smoothstep(0.5, 0.0, d);
      float pulse = 0.72 + 0.28 * sin(uTime * 1.8 + vPhase);
      vec3 cyan = vec3(0.08, 0.84, 1.0);
      vec3 mint = vec3(0.18, 0.95, 0.78);
      vec3 coral = vec3(1.0, 0.36, 0.32);
      vec3 color = mix(cyan, mint, fract(vPhase * 0.17));
      color = mix(color, coral, step(5.75, mod(vPhase, 7.0)) * 0.55);
      gl_FragColor = vec4(color, core * pulse * (0.28 + vDepth * 0.72) * uIntensity);
    }
  `;

  const lineVertexSource = `
    precision highp float;
    attribute vec3 aPosition;
    uniform mat4 uProjection;
    uniform mat4 uView;
    uniform float uTime;
    varying float vFade;

    void main() {
      vec3 p = aPosition;
      p.y += sin(uTime * 0.28 + p.x * 0.09) * 0.08;
      vec4 world = uView * vec4(p, 1.0);
      gl_Position = uProjection * world;
      vFade = smoothstep(-70.0, -8.0, world.z);
    }
  `;

  const lineFragmentSource = `
    precision highp float;
    uniform float uIntensity;
    varying float vFade;

    void main() {
      gl_FragColor = vec4(0.08, 0.84, 1.0, 0.12 * vFade * uIntensity);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function program(vs, fs) {
    const nextProgram = gl.createProgram();
    gl.attachShader(nextProgram, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(nextProgram, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(nextProgram);
    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(nextProgram));
    }
    return nextProgram;
  }

  const particleProgram = program(vertexSource, fragmentSource);
  const lineProgram = program(lineVertexSource, lineFragmentSource);

  const particleCount = 1300;
  const particleData = new Float32Array(particleCount * 5);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = 8 + Math.random() * 42;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 36;
    particleData[i * 5] = Math.cos(angle) * radius;
    particleData[i * 5 + 1] = height;
    particleData[i * 5 + 2] = -8 - Math.random() * 72;
    particleData[i * 5 + 3] = 1.2 + Math.random() * 4.8;
    particleData[i * 5 + 4] = Math.random() * 40;
  }

  const grid = [];
  const size = 36;
  const step = 4;
  for (let i = -size; i <= size; i += step) {
    grid.push(-size, -10, i, size, -10, i);
    grid.push(i, -10, -size, i, -10, size);
  }

  const particleBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);

  const gridBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grid), gl.STATIC_DRAW);

  function mat4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function mat4View(time) {
    const yaw = pointer.x * 0.18;
    const pitch = pointer.y * 0.12;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosX = Math.cos(pitch);
    const sinX = Math.sin(pitch);
    const drift = Math.sin(time * 0.18) * 1.3;

    return new Float32Array([
      cosY, sinX * sinY, -cosX * sinY, 0,
      0, cosX, sinX, 0,
      sinY, -sinX * cosY, cosX * cosY, 0,
      drift + pointer.x * 2.5, pointer.y * 1.3, -2, 1
    ]);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, width, height);
    }
  }

  function setMatrixUniforms(activeProgram, time) {
    const projection = mat4Perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 140);
    const view = mat4View(time);
    gl.uniformMatrix4fv(gl.getUniformLocation(activeProgram, "uProjection"), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(activeProgram, "uView"), false, view);
    gl.uniform1f(gl.getUniformLocation(activeProgram, "uTime"), time);
    gl.uniform1f(gl.getUniformLocation(activeProgram, "uIntensity"), intensity);
  }

  function drawParticles(time) {
    gl.useProgram(particleProgram);
    setMatrixUniforms(particleProgram, time);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);

    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
    const position = gl.getAttribLocation(particleProgram, "aPosition");
    const sizeLocation = gl.getAttribLocation(particleProgram, "aSize");
    const phase = gl.getAttribLocation(particleProgram, "aPhase");

    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(sizeLocation);
    gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(phase);
    gl.vertexAttribPointer(phase, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.drawArrays(gl.POINTS, 0, particleCount);
  }

  function drawGrid(time) {
    gl.useProgram(lineProgram);
    setMatrixUniforms(lineProgram, time);
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);

    const position = gl.getAttribLocation(lineProgram, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, grid.length / 3);
  }

  function render(now) {
    resize();
    const time = (now - start) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    drawGrid(time);
    drawParticles(time);
    requestAnimationFrame(render);
  }

  window.addEventListener("pointermove", (event) => {
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - 0.5) * -2;
  });

  window.addEventListener("scroll", () => {
    const scrollDepth = Math.min(window.scrollY / Math.max(1, document.body.scrollHeight - innerHeight), 1);
    pointer.ty += (scrollDepth - 0.5) * 0.012;
  }, { passive: true });

  document.querySelector(".cursor-hint").addEventListener("click", () => {
    intensity = intensity > 0.55 ? 0.32 : 1;
    document.body.classList.toggle("low-power", intensity < 0.5);
  });

  document.querySelectorAll(".project-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${y * -8}deg) rotateY(${x * 10}deg) translateY(-8px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });

  requestAnimationFrame(render);
})();
