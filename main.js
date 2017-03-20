var $ = require("jquery");
var ExprEvalParser = require('expr-eval').Parser;
var exprEvalParser = new ExprEvalParser();

/* jshint esnext: true */

Date.epoch = (() => Date.now() / 1000);

// from https://gist.github.com/wteuber/6241786
Math.fmod = ((a,b) => Number((a - (Math.floor(a / b) * b)).toPrecision(8)));

Math.square = ((a) => (a * a));

/*
 * Based on https://github.com/mdn/webgl-examples
 */

var canvas;
var gl;

var canvasBoundingRect;
var canvasWidth;
var canvasHeight;

var exprEvalExpression;

var cubeVerticesBuffer;
var cubeVerticesColorBuffer;
var cubeVerticesIndexBuffer;
var cubeVerticesIndexBufferLength;
var cubeRotationYZ = 0.0;
var cubeRotationXZ = 0.0;
var cubeRotationXY = 0.0;
var cubeXOffset = 0.0;
var cubeYOffset = 0.0;
var cubeZOffset = 0.0;
var lastCubeUpdateTime = 0;
var xIncValue = 0.2;
var yIncValue = -0.4;
var zIncValue = 0.3;

var mvMatrix;
var shaderProgram;
var vertexPositionAttribute;
var vertexColorAttribute;
var perspectiveMatrix;

$(document).ready(start);

//
// start
//
// Called when the canvas is created to get the ball rolling.
//
function start() {
    setupInteraction();
    canvas = document.getElementById("glcanvas");
    onResize();
    $(window).on('resize', onResize);

    // Only continue if WebGL is available and working

    if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
        gl.clearDepth(1.0);                 // Clear everything
        gl.enable(gl.DEPTH_TEST);           // Enable depth testing
        gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

        // Initialize the shaders; this is where all the lighting for the
        // vertices and so forth is established.

        initShaders();

        // Here's where we call the routine that builds all the objects
        // we'll be drawing.

        initBuffers();

        // Set up to draw the scene periodically.
        cubeRotationXY = 30;
        cubeRotationYZ = -45;
        setInterval(drawScene, 15);
    }
}

function setupInteraction() {
    setupMouseWheel();
    setupMouseDrag();
    setupFormulaInput();
}

function setupMouseWheel() {
    // https://stackoverflow.com/questions/8189840/get-mouse-wheel-events-in-jquery
    function callback(event) {
        var normalized;
        if (event.wheelDelta) {
            normalized = (event.wheelDelta % 120 - 0) == -0 ? event.wheelDelta / 120 : event.wheelDelta / 12;
        } else {
            var rawAmmount = event.deltaY ? event.deltaY : event.detail;
            normalized = -(rawAmmount % 3 ? rawAmmount * 10 : rawAmmount / 3);
        }
        incrementZoom(normalized);
    }

    var event = 'onwheel' in document ? 'wheel' : 'onmousewheel' in document ? 'mousewheel' : 'DOMMouseScroll';
    window.addEventListener(event, callback);
}

var prevMouseDraggingPosition = null;

function setupMouseDrag() {
    $('#glcanvas').mousedown(
            function(e) {
                //console.log("mouse down: " + e.pageX + ", " + e.pageY);
                prevMouseDraggingPosition = pageToCanvasCoordinates({x: e.pageX, y: e.pageY});
            });

    $('#glcanvas').mouseup(
            function(e) {
                //console.log("mouse up: " + e.pageX + ", " + e.pageY);
                prevMouseDraggingPosition = null;
            });

    $('#glcanvas').mousemove(
            function(e) {
                if (prevMouseDraggingPosition !== null) {
                    var currentPosition = pageToCanvasCoordinates({x: e.pageX, y: e.pageY});
                    var movement = canvasCoordinatesSubtract(currentPosition, prevMouseDraggingPosition);
                    var relMovementX = movement.x / canvasBoundingRect.width;
                    var relMovementY = movement.y / canvasBoundingRect.height;
                    cubeRotationXY += (relMovementX * 180.0);
                    cubeRotationYZ += (relMovementY * 180.0);
                    //console.log("relMovementX: " + relMovementX);
                    //console.log("relMovementY: " + relMovementY);
                    prevMouseDraggingPosition = currentPosition;
                }
            });

//    $('#glcanvas').bind('touchstart',
//            function(e) {
//                var targetTouches = e.originalEvent.targetTouches;
//                if (targetTouches.length != 1) {
//                    return;
//                }
//                var touch = targetTouches[0];
//                prevMouseDraggingPosition = pageToCanvasCoordinates({x: touch.pageX, y: touch.pageY});
//            });
//
//    $('#glcanvas').bind('touchend',
//            function(e) {
//                prevMouseDraggingPosition = null;
//            });
//
//    $('#glcanvas').bind('touchmove',
//            function (e) {
//                var targetTouches = e.originalEvent.targetTouches;
//                if (targetTouches.length != 1) {
//                    return;
//                }
//                var touch = targetTouches[0];
//                if (prevMouseDraggingPosition !== null) {
//                    var currentPosition = pageToCanvasCoordinates({x: touch.pageX, touch: e.pageY});
//                    var movement = canvasCoordinatesSubtract(currentPosition, prevMouseDraggingPosition);
//                    var relMovementX = movement.x / canvasBoundingRect.width;
//                    var relMovementY = movement.y / canvasBoundingRect.height;
//                    cubeRotationXY += (relMovementX * 180.0);
//                    cubeRotationYZ += (relMovementY * 180.0);
//                    //console.log("relMovementX: " + relMovementX);
//                    //console.log("relMovementY: " + relMovementY);
//                    prevMouseDraggingPosition = currentPosition;
//                }
//            });
}

function setupFormulaInput() {
    $('#formulaInput').val('1 / (x * y)');

    function reparse(input) {
        var exprString = input.val();
        try {
            exprEvalExpression = exprEvalParser.parse(exprString);
            input.css("background-color","#AFA");
        }
        catch (err) {
            input.css("background-color","#FAA");
        }
    }
    reparse($('#formulaInput'));

    $('#formulaInput').on("change paste keyup",
            function () {
                reparse($(this));
            });
}

function pageToCanvasCoordinates(coords) {
    return {x: coords.x - canvasBoundingRect.left, y: coords.y - canvasBoundingRect.top};
}

function canvasCoordinatesMagnitude(coords) {
    return Math.sqrt(Math.square(coords.x) + Math.square(coords.y));
}

function canvasCoordinatesSubtract(coords1, coords2) {
    return {
        x: coords1.x - coords2.x,
        y: coords1.y - coords2.y};
}

function onResize() {
    canvasBoundingRect = canvas.getBoundingClientRect();
    canvasWidth = canvasBoundingRect.width;
    canvasHeight = canvasBoundingRect.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    initWebGL(canvas);      // Initialize the GL context
}

//
// initWebGL
//
// Initialize WebGL, returning the GL context or null if
// WebGL isn't available or could not be initialized.
//
function initWebGL() {
    gl = null;

    try {
        gl = canvas.getContext("experimental-webgl");
    }
    catch(e) {
    }

    // If we don't have a GL context, give up now

    if (!gl) {
        alert("Unable to initialize WebGL. Your browser may not support it.");
    }

    if (!gl.getExtension('OES_element_index_uint')) {
        // TODO graceful fallback
        alert("Your browser doesn't support OES_element_index_uint");
    }
}

//
// initBuffers
//
// Initialize the buffers we'll need. For this demo, we just have
// one object -- a simple two-dimensional cube.
//
function initBuffers() {
  cubeVerticesBuffer = gl.createBuffer();

  cubeVerticesColorBuffer = gl.createBuffer();

  cubeVerticesIndexBuffer = gl.createBuffer();

  refreshBuffers(true);
  setInterval(refreshBuffers, 1000 / 25);
}

var vertices;
var verticeIndices;

function refreshBuffers(firstTime) {
    var minX = -10.0;
    var maxX = +10.0;
    var minY = -10.0;
    var maxY = +10.0;
    var resolutionX = 0.05;
    var resolutionY = 0.05;
    var numPointsX = Math.ceil((maxX - minX) / resolutionX);
    var numPointsY = Math.ceil((maxY - minY) / resolutionY);

    var numPoints = numPointsX * numPointsY;
    var xIdx = 0;
    var yIdx = 0;
    var verticesIdx = 0;
    var x = 0.0;
    var y = 0.0;

    if (firstTime === true) {
        //vertices = Array.apply(null, Array(numPoints)).map(Number.prototype.valueOf, 0);
        vertices = new Float32Array(numPoints * 3);
        vertexIndices = new Uint32Array(vertices.length * 2);

        for (xIdx = 0, verticesIdx = 0; xIdx < numPointsX; xIdx++) {
            for (yIdx = 0; yIdx < numPointsY; yIdx++) {
                x = minX + (xIdx * resolutionX);
                y = minY + (yIdx * resolutionY);
                vertices[verticesIdx++] = x;
                vertices[verticesIdx++] = y;
                verticesIdx++;
            }
        }

        for (var pointIdx = numPointsY + 1, vertexIndicesIdx = 0; pointIdx < numPoints; pointIdx++) {
            if ((pointIdx % numPointsY) === 0){
                continue;
            }
            // first triangle
            vertexIndices[vertexIndicesIdx++] = (pointIdx - numPointsY - 1); // left bottom
            vertexIndices[vertexIndicesIdx++] = (pointIdx - 1);              // left top
            vertexIndices[vertexIndicesIdx++] = (pointIdx - numPointsY);     // right bottom
            // second triangle
            vertexIndices[vertexIndicesIdx++] = (pointIdx - 1);          // left top
            vertexIndices[vertexIndicesIdx++] = (pointIdx);              // right top
            vertexIndices[vertexIndicesIdx++] = (pointIdx - numPointsY); // right bottom
        }
    }


    for (xIdx = 0, verticesIdx = 0; xIdx < numPointsX; xIdx++) {
        for (yIdx = 0; yIdx < numPointsY; yIdx++) {
            x = vertices[verticesIdx++];
            y = vertices[verticesIdx++];
            var z = (
                    (0.5 * Math.sin(1 * 2 * Math.PI * (x + Date.epoch()))) +
                    (0.5 * Math.cos(2 * Math.PI * (y + Date.epoch())))
                    );
            z = exprEvalExpression.evaluate({x: x, y: y, t: Date.epoch()});
            //z *= Math.sin(2 * Math.PI * Date.epoch());
            vertices[verticesIdx++] = z;
        }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);


    if (firstTime === true) {
        var generatedColors = new Float32Array(vertices.length * 4);
        for (var i=0; i < generatedColors.length; i += 4) {
            generatedColors[i] = 1.0; // red
            generatedColors[i + 3] = 1.0; // alpha
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, generatedColors, gl.STATIC_DRAW);

        cubeVerticesIndexBufferLength = vertexIndices.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
        gl.bufferData(
                gl.ELEMENT_ARRAY_BUFFER,
                vertexIndices, gl.STATIC_DRAW);
    }
}

var zDistance = -35;

function incrementZoom(value) {
    zDistance += value;
}

//
// drawScene
//
// Draw the scene.
//
function drawScene() {
  // Clear the canvas before we start drawing on it.

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Establish the perspective with which we want to view the
  // scene. Our field of view is 45 degrees, with a width/height
  // ratio of 640:480, and we only want to see objects between 0.1 units
  // and 100 units away from the camera.

  perspectiveMatrix = makePerspective(45, canvasWidth/(1.0 * canvasHeight), 0.1, 100.0);

  // Set the drawing position to the "identity" point, which is
  // the center of the scene.

  loadIdentity();

  // Now move the drawing position a bit to where we want to start
  // drawing the cube.

  mvTranslate([-0.0, 0.0, zDistance]);

  // Save the current matrix, then rotate before we draw.

  mvPushMatrix();
  mvRotate(cubeRotationYZ, [1, 0, 0]);
  mvRotate(cubeRotationXZ, [0, 1, 0]);
  mvRotate(cubeRotationXY, [0, 0, 1]);
  mvTranslate([cubeXOffset, cubeYOffset, cubeZOffset]);

  // Draw the cube by binding the array buffer to the cube's vertices
  // array, setting attributes, and pushing it to GL.

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesBuffer);
  gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

  // Set the colors attribute for the vertices.

  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVerticesColorBuffer);
  gl.vertexAttribPointer(vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);

  // Draw the cube.

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeVerticesIndexBuffer);
  setMatrixUniforms();
  gl.drawElements(gl.TRIANGLES, cubeVerticesIndexBufferLength, gl.UNSIGNED_INT, 0);

  // Restore the original matrix

  mvPopMatrix();

  // Update the rotation for the next draw, if it's time to do so.

  var currentTime = (new Date).getTime();
  if (lastCubeUpdateTime) {
    var delta = currentTime - lastCubeUpdateTime;

    //cubeRotation += (30 * delta) / 1000.0;
    //cubeXOffset += xIncValue * ((30 * delta) / 1000.0);
    //cubeYOffset += yIncValue * ((30 * delta) / 1000.0);
    //cubeZOffset += zIncValue * ((30 * delta) / 1000.0);

    //if (Math.abs(cubeYOffset) > 2.5) {
    //  xIncValue = -xIncValue;
    //  yIncValue = -yIncValue;
    //  zIncValue = -zIncValue;
    //}
  }

  lastCubeUpdateTime = currentTime;
}

//
// initShaders
//
// Initialize the shaders, so WebGL knows how to light our scene.
//
function initShaders() {
  var fragmentShader = getShader(gl, "shader-fs");
  var vertexShader = getShader(gl, "shader-vs");

  // Create the shader program

  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize the shader program: " + gl.getProgramInfoLog(shader));
  }

  gl.useProgram(shaderProgram);

  vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(vertexPositionAttribute);

  vertexColorAttribute = gl.getAttribLocation(shaderProgram, "aVertexColor");
  gl.enableVertexAttribArray(vertexColorAttribute);
}

//
// getShader
//
// Loads a shader program by scouring the current document,
// looking for a script with the specified ID.
//
function getShader(gl, id) {
  var shaderScript = document.getElementById(id);

  // Didn't find an element with the specified ID; abort.

  if (!shaderScript) {
    return null;
  }

  // Walk through the source element's children, building the
  // shader source string.

  var theSource = "";
  var currentChild = shaderScript.firstChild;

  while(currentChild) {
    if (currentChild.nodeType == 3) {
      theSource += currentChild.textContent;
    }

    currentChild = currentChild.nextSibling;
  }

  // Now figure out what type of shader script we have,
  // based on its MIME type.

  var shader;

  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;  // Unknown shader type
  }

  // Send the source to the shader object

  gl.shaderSource(shader, theSource);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}

//
// Matrix utility functions
//

function loadIdentity() {
  mvMatrix = Matrix.I(4);
}

function multMatrix(m) {
  mvMatrix = mvMatrix.x(m);
}

function mvTranslate(v) {
  multMatrix(Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4());
}

function setMatrixUniforms() {
  var pUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

  var mvUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.flatten()));
}

var mvMatrixStack = [];

function mvPushMatrix(m) {
  if (m) {
    mvMatrixStack.push(m.dup());
    mvMatrix = m.dup();
  } else {
    mvMatrixStack.push(mvMatrix.dup());
  }
}

function mvPopMatrix() {
  if (!mvMatrixStack.length) {
    throw("Can't pop from an empty matrix stack.");
  }

  mvMatrix = mvMatrixStack.pop();
  return mvMatrix;
}

function mvRotate(angle, v) {
  var inRadians = angle * Math.PI / 180.0;

  var m = Matrix.Rotation(inRadians, $V([v[0], v[1], v[2]])).ensure4x4();
  multMatrix(m);
}
