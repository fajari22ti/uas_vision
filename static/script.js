async function uploadImage() {

    const input = document.getElementById("imageInput");

    if (input.files.length === 0) {

        alert("Pilih gambar terlebih dahulu.");

        return;

    }

    const formData = new FormData();

    formData.append("image", input.files[0]);

    try {

        const response = await fetch("/detect/image", {

            method: "POST",

            body: formData

        });

        const data = await response.json();

        if (!data.success) {

            alert(data.message);

            return;

        }

        // tampilkan gambar hasil deteksi

        document.getElementById("resultImage").src =
            "data:image/jpeg;base64," + data.image;

        // statistik

        document.getElementById("available").innerHTML =
            data.available;

        document.getElementById("occupied").innerHTML =
            data.occupied;

        document.getElementById("total").innerHTML =
            data.total;

        // tabel

        let tbody = document.getElementById("resultTable");

        tbody.innerHTML = "";

        data.results.forEach((item, index) => {

            let color =
                item.status === "Empty"
                ? "table-success"
                : "table-danger";

            tbody.innerHTML += `

            <tr class="${color}">

                <td>${index+1}</td>

                <td>${item.status}</td>

                <td>${item.confidence}%</td>

            </tr>

            `;

        });

    }

    catch(error){

        console.log(error);

        alert("Server Error");

    }

}
