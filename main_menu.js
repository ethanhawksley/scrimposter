function genRoomCode(){
    let chars = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","0","1","2","3","4","5","6","7","8","9"]
    let code = ""
    for (let step = 0; step < 6; step++) {
        code = code + chars[Math.floor(Math.random() * chars.length)]
    }
    document.getElementById("CodeGen").innerText = code
}

async function post_code(code, post_url){
    const response = await fetch(post_url, {
        method: "POST",
        headers: {"Content-Type": "text/plain"},
        body: code
    });
    const receivedCode = await response.text();
    if (!response.ok) {
        document.getElementById("CodeRec").textContent = `Request failed (${response.status}): ${receivedCode}`;
        return;
    }
    document.getElementById("CodeRec").textContent = receivedCode;
}
