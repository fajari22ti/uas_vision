// =============================
// SMART PARKING DETECTION
// Rizki Fajari
// =============================

const preview = document.getElementById("preview");

const imageInput = document.getElementById("imageInput");
const videoInput = document.getElementById("videoInput");

const btnImage = document.getElementById("btnImage");
const btnVideo = document.getElementById("btnVideo");
const btnCamera = document.getElementById("btnCamera");
const btnStop = document.getElementById("btnStop");

const loading = document.getElementById("loadingOverlay");

const totalSlot = document.getElementById("totalSlot");
const emptySlot = document.getElementById("emptySlot");
const occupiedSlot = document.getElementById("occupiedSlot");
const fpsText = document.getElementById("fps");

const tableBody = document.getElementById("resultTable");

let stream = null;
let cameraRunning = false;

//==============================
// Loading
//==============================

function showLoading(){

loading.style.display="flex";

}

function hideLoading(){

loading.style.display="none";

}

//==============================
// Update Statistics
//==============================

function updateStatistic(data){

totalSlot.innerHTML=data.total;

emptySlot.innerHTML=data.n_tersedia;

occupiedSlot.innerHTML=data.n_penuh;

}

//==============================
// Update Table
//==============================

function updateTable(results){

tableBody.innerHTML="";

if(results.length===0){

tableBody.innerHTML=
`
<tr>
<td colspan="3" class="text-center">
No Detection
</td>
</tr>
`;

return;

}

results.forEach(slot=>{

let badge=
slot.status==="Empty"
?
'<span class="badge-empty">Empty</span>'
:
'<span class="badge-occupied">Occupied</span>';

tableBody.innerHTML+=
`
<tr>

<td>${slot.slot_id}</td>

<td>${badge}</td>

<td>${slot.confidence}%</td>

</tr>
`;

});

}

//==============================
// Update Preview
//==============================

function updatePreview(image){

preview.src="data:image/jpeg;base64,"+image;

}

//==============================
// Upload Image
//==============================

btnImage.onclick=()=>{

imageInput.click();

};

imageInput.onchange=()=>{

let file=imageInput.files[0];

if(!file)return;

let formData=new FormData();

formData.append("image",file);

showLoading();

fetch("/detect/image",{

method:"POST",

body:formData

})

.then(res=>res.json())

.then(data=>{

hideLoading();

updatePreview(data.image_b64);

updateStatistic(data);

updateTable(data.results);

})

.catch(err=>{

hideLoading();

alert("Detection Failed");

console.log(err);

});

};

//==============================
// Upload Video
//==============================

btnVideo.onclick=()=>{

videoInput.click();

};

videoInput.onchange=()=>{

let file=videoInput.files[0];

if(!file)return;

let formData=new FormData();

formData.append("video",file);

showLoading();

fetch("/detect/video",{

method:"POST",

body:formData

})

.then(res=>res.json())

.then(data=>{

hideLoading();

updatePreview(data.image_b64);

updateStatistic(data);

updateTable(data.results);

})

.catch(err=>{

hideLoading();

console.log(err);

alert("Video Error");

});

};

//==============================
// Live Camera
//==============================

btnCamera.onclick=async()=>{

if(cameraRunning)return;

cameraRunning=true;

stream=await navigator.mediaDevices.getUserMedia({

video:true

});

const video=document.createElement("video");

video.srcObject=stream;

await video.play();

const canvas=document.createElement("canvas");

const ctx=canvas.getContext("2d");

async function detect(){

if(!cameraRunning)return;

canvas.width=video.videoWidth;

canvas.height=video.videoHeight;

ctx.drawImage(video,0,0);

let frame=canvas.toDataURL("image/jpeg");

let start=performance.now();

fetch("/detect/frame",{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

frame:frame

})

})

.then(res=>res.json())

.then(data=>{

updatePreview(data.image_b64);

updateStatistic(data);

updateTable(data.results);

let end=performance.now();

fpsText.innerHTML=Math.round(1000/(end-start));

if(cameraRunning){

requestAnimationFrame(detect);

}

});

}

detect();

};

//==============================
// Stop Camera
//==============================

btnStop.onclick=()=>{

cameraRunning=false;

if(stream){

stream.getTracks().forEach(track=>track.stop());

}

preview.src="https://placehold.co/900x520/1e293b/ffffff?text=Detection+Stopped";

};

//==============================
// Initial
//==============================

totalSlot.innerHTML=0;
emptySlot.innerHTML=0;
occupiedSlot.innerHTML=0;
fpsText.innerHTML=0;
