// $(function(){
// 	/* Morris Area Chart */
	
// 	window.mA = Morris.Area({
// 	    element: 'morrisArea',
// 	    data: [
// 	        { y: '2013', a: 60},
// 	        { y: '2014', a: 100},
// 	        { y: '2015', a: 240},
// 	        { y: '2016', a: 120},
// 	        { y: '2017', a: 80},
// 	        { y: '2018', a: 100},
// 	        { y: '2019', a: 300},
// 	    ],
// 	    xkey: 'y',
// 	    ykeys: ['a'],
// 	    labels: ['Revenue'],
// 	    lineColors: ['#1b5a90'],
// 	    lineWidth: 2,
		
//      	fillOpacity: 0.5,
// 	    gridTextSize: 10,
// 	    hideHover: 'auto',
// 	    resize: true,
// 		redraw: true
// 	});
	
// 	/* Morris Line Chart */
	
// 	window.mL = Morris.Line({
// 	    element: 'morrisLine',
// 	    data: [
// 	        { y: '2015', a: 100, b: 30},
// 	        { y: '2016', a: 20,  b: 60},
// 	        { y: '2017', a: 90,  b: 120},
// 	        { y: '2018', a: 50,  b: 80},
// 	        { y: '2019', a: 120,  b: 150},
// 	    ],
// 	    xkey: 'y',
// 	    ykeys: ['a', 'b'],
// 	    labels: ['Doctors', 'Patients'],
// 	    lineColors: ['#1b5a90','#ff9d00'],
// 	    lineWidth: 1,
// 	    gridTextSize: 10,
// 	    hideHover: 'auto',
// 	    resize: true,
// 		redraw: true
// 	});
// 	$(window).on("resize", function(){
// 		mA.redraw();
// 		mL.redraw();
// 	});

// });



$(function(){
	if ($('#morrisArea').length > 0) {
	  const formattedRevenue = chartRevenueData.map(item => ({
		y: item._id,
		a: item.total
	  }));
  
	  window.mA = Morris.Area({
		element: 'morrisArea',
		data: formattedRevenue,
		xkey: 'y',
		ykeys: ['a'],
		labels: ['Revenue'],
		lineColors: ['#1b5a90'],
		lineWidth: 2,
		fillOpacity: 0.5,
		gridTextSize: 10,
		hideHover: 'auto',
		resize: true,
		redraw: true
	  });
	}
  
	if ($('#morrisLine').length > 0) {
	  const appointmentMap = {};
	  chartAppointmentData.forEach(item => {
		const month = item._id.month;
		if (!appointmentMap[month]) {
		  appointmentMap[month] = { y: month };
		}
		appointmentMap[month][item._id.status] = item.count;
	  });
  
	  const formattedAppointments = Object.values(appointmentMap);
  
	  window.mL = Morris.Line({
		element: 'morrisLine',
		data: formattedAppointments,
		xkey: 'y',
		ykeys: ['Scheduled', 'Completed', 'Cancelled'],
		labels: ['Scheduled', 'Completed', 'Cancelled'],
		lineColors: ['#1b5a90', '#00d25b', '#fc424a'],
		lineWidth: 1,
		gridTextSize: 10,
		hideHover: 'auto',
		resize: true,
		redraw: true
	  });
	}
  
	$(window).on("resize", function(){
	  if (window.mA) mA.redraw();
	  if (window.mL) mL.redraw();
	});
  });