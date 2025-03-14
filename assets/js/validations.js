    function LoginVal(){
        const Email = document.getElementById("loginEmail").value;
        const Password = document.getElementById("loginPass").value;
        if (Email == "" || Password == "") {
            alert("Please fill in all fields");
            return false
        }

        return true
    }

    function RegisterVal(){
        const username= document.getElementById("regName").value;
        const Email = document.getElementById("regEmail").value;
        const Password = document.getElementById("regPass").value;

        if(!username || !Email || !Password){
            alert("Please fill in all fields");
            return false
        }
        
        if(Password.length < 8){
            alert("Password must be at least 8 characters");
            return false
        }

        const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
        if(!emailPattern.test(Email)){
            alert("Invalid email address");
            return false
        } 

        return true;
    }