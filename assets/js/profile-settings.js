(function ($) {
  "use strict";

  // Pricing Options Show

  $('#pricing_select input[name="rating_option"]').on("click", function () {
    if ($(this).val() == "price_free") {
      $("#custom_price_cont").hide();
    }
    if ($(this).val() == "custom_price") {
      $("#custom_price_cont").show();
    } else {
    }
  });

  // Education Add More

  $(".education-info").on("click", ".trash", function () {
    $(this).closest(".education-cont").remove();
    return false;
  });

  $(".add-education").on("click", function () {
    var educationcontent =
      '<div class="row form-row education-cont">' +
      '<div class="col-12 col-md-10 col-lg-11">' +
      '<div class="row form-row">' +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>Degree</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>College/Institute</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>Year of Completion</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-2 col-lg-1"><label class="d-md-block d-sm-none d-none">&nbsp;</label><a href="#" class="btn btn-danger trash"><i class="far fa-trash-alt"></i></a></div>' +
      "</div>";

    $(".education-info").append(educationcontent);
    return false;
  });

  // Experience Add More

  $(".experience-info").on("click", ".trash", function () {
    $(this).closest(".experience-cont").remove();
    return false;
  });

  $(".add-experience").on("click", function () {
    var experiencecontent =
      '<div class="row form-row experience-cont">' +
      '<div class="col-12 col-md-10 col-lg-11">' +
      '<div class="row form-row">' +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>Hospital Name</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>From</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>To</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-6 col-lg-4">' +
      '<div class="form-group">' +
      "<label>Designation</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-2 col-lg-1"><label class="d-md-block d-sm-none d-none">&nbsp;</label><a href="#" class="btn btn-danger trash"><i class="far fa-trash-alt"></i></a></div>' +
      "</div>";

    $(".experience-info").append(experiencecontent);
    return false;
  });

  // Awards Add More

  $(".awards-info").on("click", ".trash", function () {
    $(this).closest(".awards-cont").remove();
    return false;
  });

  $(".add-award").on("click", function () {
    var regcontent =
      '<div class="row form-row awards-cont">' +
      '<div class="col-12 col-md-5">' +
      '<div class="form-group">' +
      "<label>Awards</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-5">' +
      '<div class="form-group">' +
      "<label>Year</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-2">' +
      '<label class="d-md-block d-sm-none d-none">&nbsp;</label>' +
      '<a href="#" class="btn btn-danger trash"><i class="far fa-trash-alt"></i></a>' +
      "</div>" +
      "</div>";

    $(".awards-info").append(regcontent);
    return false;
  });

  // Membership Add More

  $(".membership-info").on("click", ".trash", function () {
    $(this).closest(".membership-cont").remove();
    return false;
  });

  $(".add-membership").on("click", function () {
    var membershipcontent =
      '<div class="row form-row membership-cont">' +
      '<div class="col-12 col-md-10 col-lg-5">' +
      '<div class="form-group">' +
      "<label>Memberships</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-2 col-lg-2">' +
      '<label class="d-md-block d-sm-none d-none">&nbsp;</label>' +
      '<a href="#" class="btn btn-danger trash"><i class="far fa-trash-alt"></i></a>' +
      "</div>" +
      "</div>";

    $(".membership-info").append(membershipcontent);
    return false;
  });

  // Registration Add More

  $(".registrations-info").on("click", ".trash", function () {
    $(this).closest(".reg-cont").remove();
    return false;
  });

  $(".add-reg").on("click", function () {
    var regcontent =
      '<div class="row form-row reg-cont">' +
      '<div class="col-12 col-md-5">' +
      '<div class="form-group">' +
      "<label>Registrations</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-5">' +
      '<div class="form-group">' +
      "<label>Year</label>" +
      '<input type="text" class="form-control">' +
      "</div>" +
      "</div>" +
      '<div class="col-12 col-md-2">' +
      '<label class="d-md-block d-sm-none d-none">&nbsp;</label>' +
      '<a href="#" class="btn btn-danger trash"><i class="far fa-trash-alt"></i></a>' +
      "</div>" +
      "</div>";

    $(".registrations-info").append(regcontent);
    return false;
  });

  // Handle dynamic addition of availability slots
  $(document).on("click", ".add-availability", function () {
    console.log("Add More button clicked!"); // Debugging

    // Clone the first availability row
    var availabilityRow = $(".availability-row:first").clone();

    // Reset values in the cloned row
    availabilityRow.find("select").val("").trigger("change");
    availabilityRow.find(".end-time")

    // Remove any previous "remove" button (to avoid duplicates) and add a new one
    availabilityRow.find(".remove-availability").remove();
    availabilityRow.append(`
		  <div class="col-12 col-md-1">
			<a href="javascript:void(0)" class="btn btn-danger remove-availability mt-4">
			  <i class="fa fa-trash"></i>
			</a>
		  </div>
		`);

    // Update the data-index attribute for the new row
    const newIndex = $(".availability-row").length;
    availabilityRow.find("select").each(function () {
      $(this).attr("data-index", newIndex);
    });

    // Append the new row to the availability slots container
    $(".availability-slots").append(availabilityRow);

    // Re-initialize Select2 for newly added selects
    availabilityRow.find(".select").select2({
      minimumResultsForSearch: -1,
      width: "100%",
    });

    console.log("New availability row added:", availabilityRow);
  });

  // Handle removal of availability slots
  $(document).on("click", ".remove-availability", function () {
    $(this).closest(".availability-row").remove();
    console.log("Availability row removed!");
  });
})(jQuery);
