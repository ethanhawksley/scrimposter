async function post_image(canvasId, post_url){
    var canvas = document.getElementById(canvasId);
    var img = new Image();
    img.src = canvas.toDataURL();
    const response = await fetch(post_url, 
    {
        method: "POST",
        body: img.src
    })
}
