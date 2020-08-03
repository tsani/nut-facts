function hello(){
    const Http = new XMLHttpRequest();
    const url="/hello";

    Http.open("GET", url);
    Http.send();

    var para = document.createElement("P");
    var t = document.createTextNode("paragraph words");
    para.appendChild(t);
    Http.onreadystatechange=(e) =>{
        console.log("in the if");
        document.getElementById("testing").appendChild(para);
    }
}
